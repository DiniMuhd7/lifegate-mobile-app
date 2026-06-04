/**
 * Tab Layout with Drawer Navigation
 * - ChatScreen as primary (first screen after login)
 * - HomeScreen as secondary
 * - ConversationDrawer as side drawer for conversation history
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler, Platform } from 'react-native';
import { LoadingScreen } from 'components/LoadingScreen';
import { SessionErrorScreen } from 'components/SessionErrorScreen';
import * as Notifications from 'expo-notifications';
import { Drawer } from 'expo-router/drawer';
import { router, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConversationDrawer } from 'components/ConversationDrawer';
import { ResumeSessionModal } from 'components/ResumeSessionModal';
import { ProfileReminderBanner } from 'components/ProfileReminderBanner';
import { InAppNotificationBanner } from 'components/InAppNotificationBanner';
import { InstantMessageModal } from 'components/InstantMessageModal';
import { Ionicons } from '@expo/vector-icons';
import { useDiagnosisWebSocket } from 'utils/useWebSocket';
import { useChatStore } from '@/stores/chat-store';
import { useSessionStore } from '@/stores/session-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { useNotificationStore, PhysicianNotification } from 'stores/notification-store';
import { useIMStore } from 'stores/im-store';
import wsService from 'services/websocket-service';
import { playIMArrivalTone } from 'services/message-tone';
import { getToken } from 'utils/tokenStorage';
import { User } from 'types/auth-types';
import { IMMessage } from 'types/im-types';
import { registerPatientPushToken, addNotificationResponseListener, addNotificationReceivedListener } from 'utils/pushNotifications';
import { registerWebPush, syncWebAppBadge } from 'services/webPushRegistration';
import { startHealthMonitoring, stopHealthMonitoring } from 'utils/backgroundHealthMonitor';
import { EngagementService } from 'services/engagement-service';

function isHealthProfileIncomplete(user: User | null): boolean {
  if (!user || user.role !== 'user') return false;
  return (
    !user.blood_type ||
    !user.genotype ||
    !user.allergies ||
    !user.medical_history ||
    !user.current_medications ||
    !user.emergency_contact
  );
}

/**
 * Custom drawer content showing conversation history
 */
const CustomDrawerContent = (props: { navigation: { closeDrawer: () => void } }) => {
  return <ConversationDrawer onClose={() => props.navigation.closeDrawer()} />;
};

export default function TabLayout() {
  // Maintain a live WebSocket connection for real-time diagnosis status updates.
  useDiagnosisWebSocket();

  // ── In-app IM notification banner ─────────────────────────────────────────
  const [banner, setBanner] = useState<PhysicianNotification | null>(null);
  const [liveIM, setLiveIM] = useState<{ diagnosisId: string; counterpartName: string } | null>(null);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const lastIMPopupAtRef = useRef(0);

  const IM_POPUP_COOLDOWN_MS = 3000;

  // ── Sync OS app-icon badge with total IM unread count ─────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const unsub = useIMStore.subscribe((state) => {
      const total = Object.values(state.conversations).reduce(
        (sum, c) => sum + c.unreadCount,
        0,
      );
      Notifications.setBadgeCountAsync(total).catch(() => {});
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const syncBadge = () => {
      const imUnread = Object.values(useIMStore.getState().conversations).reduce(
        (sum, conversation) => sum + conversation.unreadCount,
        0,
      );
      const notificationUnread = useNotificationStore.getState().unreadCount;
      void syncWebAppBadge(imUnread + notificationUnread);
    };

    syncBadge();
    const unsubIM = useIMStore.subscribe(syncBadge);
    const unsubNotifications = useNotificationStore.subscribe(syncBadge);

    return () => {
      unsubIM();
      unsubNotifications();
    };
  }, []);

  useEffect(() => {
    const unsub = useNotificationStore.subscribe((state) => {
      // Find the most recent unread IM message (not necessarily at index 0 —
      // a simultaneous diagnosis.update may have been prepended ahead of it).
      const latest = state.notifications.find(
        (n) => !n.isRead && n.type === 'im_message',
      );
      if (latest) {
        setBanner((prev) => (prev?.id === latest.id ? prev : latest));
      }
    });
    return unsub;
  }, []);

  const handleDismissBanner = useCallback(() => setBanner(null), []);
  const handleBannerPress = useCallback(() => {
    if (banner?.caseId) {
      router.push({ pathname: '/(tab)/diagnosis/[id]', params: { id: banner.caseId, openIM: 'true' } });
    }
    setBanner(null);
  }, [banner]);

  // ── Auto-open IM modal for incoming physician messages ──────────────────
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'user') return;

    const unsubIncomingIM = wsService.on('im.message', (data) => {
      const msg = data as IMMessage;
      if (!msg?.diagnosis_id) return;

      playIMArrivalTone().catch(() => {});

      const now = Date.now();
      if (now - lastIMPopupAtRef.current < IM_POPUP_COOLDOWN_MS) return;
      lastIMPopupAtRef.current = now;

      setLiveIM((prev) => {
        // Keep existing modal if it's already open for this case.
        if (prev?.diagnosisId === msg.diagnosis_id) return prev;
        return {
          diagnosisId: msg.diagnosis_id,
          counterpartName: msg.sender_name || 'Physician',
        };
      });
    });

    return () => unsubIncomingIM();
  }, [isAuthenticated, user?.role]);

  // ── Connect wsService so IM modal read-receipts and typing work ────────────
  const wsConnected = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (wsConnected.current) return;
    getToken().then((token) => {
      if (token) {
        wsService.connect(token);
        wsConnected.current = true;
      }
    });
    return () => {
      wsService.disconnect();
      wsConnected.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Auth guard — redirect unauthenticated or wrong-role users ─────────────
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
  const sessionError = useAuthStore((s) => s.sessionError);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;
    if (sessionLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (user?.role === 'admin') {
      router.replace('/(admin-tab)/dashboard');
    } else if (user?.role === 'professional') {
      if (user.mdcn_verified) {
        router.replace('/(prof-tab)/review');
      } else {
        router.replace('/physician-pending');
      }
    }
  }, [navigationState?.key, isAuthenticated, user, sessionLoading]);

  // ── Patient push token registration ───────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'user') return;
    registerPatientPushToken().catch(() => {/* best-effort */});
    registerWebPush().catch(() => {/* best-effort */});
  }, [isAuthenticated, user]);

  // ── Continuous background health monitoring ────────────────────────────────
  // Start when patient authenticates; stop on logout to release pedometer and
  // unregister the background-fetch task.
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'user') return;
    startHealthMonitoring().catch(() => {/* best-effort */});
    return () => {
      stopHealthMonitoring().catch(() => {/* best-effort */});
    };
  }, [isAuthenticated, user?.id]);

  // Handle push notification tap → navigate to diagnosis details
  useEffect(() => {
    const sub = addNotificationResponseListener((caseId) => {
      router.push({ pathname: '/(tab)/health', params: { diagnosisId: caseId } });
    });
    return () => sub.remove();
  }, []);

  // Bridge native push deliveries into the in-app notification store so banners
  // can still appear even when websocket events are missed.
  useEffect(() => {
    const sub = addNotificationReceivedListener((payload) => {
      const latest = useNotificationStore.getState().notifications[0];
      const isRecentDuplicate = !!latest &&
        !latest.isRead &&
        latest.type === payload.type &&
        latest.caseId === payload.caseId &&
        latest.message === payload.message &&
        Date.now() - latest.timestamp < 15_000;

      if (isRecentDuplicate) return;
      addNotification(payload);
    });
    return () => sub.remove();
  }, [addNotification]);

  // ── Health profile reminder ────────────────────────────────────────────────
  const [profileReminderDismissed, setProfileReminderDismissed] = useState(false);
  const showProfileReminder = !profileReminderDismissed && isHealthProfileIncomplete(user);

  // ── Initialise chat store as soon as the user is authenticated ───────────
  // This ensures conversations are loaded from AsyncStorage before any
  // screen (e.g. diagnosis/[id]) tries to look up a linkedConversation.
  // chatScreen.tsx has its own guard too, but relies on that screen being
  // mounted first — which isn't guaranteed when navigating directly from health.
  const initializeChat = useChatStore((s) => s.initializeChat);
  const chatUserId = useChatStore((s) => s.userId);
  const initializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || user.role !== 'user') return;
    if (initializedRef.current === user.id) return;
    if (chatUserId === user.id) { initializedRef.current = user.id; return; }
    initializedRef.current = user.id;
    initializeChat(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Engagement session — start on mount, end on unmount ───────────────────
  useEffect(() => {
    if (!user?.id) return;
    EngagementService.startSession();
    return () => { EngagementService.endSession(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Abandoned-session detection (save state when app goes to background) ──
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // ── Block back navigation to auth/splash screens ──────────────────────────
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        // Return false to let Expo Router handle back navigation naturally.
        // Calling router.back() here AND letting Expo Router also handle the
        // event causes a double-navigation that crashes on nested stacks
        // (e.g. Settings → About/Help Centre/Terms/Privacy).
        return false;
      }
      // At the root of the authenticated area — exit the app cleanly.
      BackHandler.exitApp();
      return true;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const wasActive = appState.current === 'active';
      const goingToBackground = nextState === 'background' || nextState === 'inactive';

      if (wasActive && goingToBackground) {
        // End engagement tracking when app goes to background.
        EngagementService.endSession();

        // Snapshot current conversation state.
        const { conversations, activeConversationId, userId } = useChatStore.getState();
        const activeConv = conversations.find((conversation) => conversation.id === activeConversationId);

        // Only persist if the conversation has at least one sent message.
        if (activeConv && activeConv.messages.length > 0 && userId) {
          const {
            activeServerSessionId,
            createSession,
            updateSession,
            setActiveServerSessionId,
          } =
            useSessionStore.getState();
          const chatStore = useChatStore.getState();

          const payload = {
            title: activeConv.title,
            category: (activeConv.category ?? '') as import('types/chat-types').ConversationCategory | '',
            mode: (activeConv.mode ?? '') as import('types/chat-types').SessionMode | '',
            status: 'abandoned' as const,
            messages: activeConv.messages,
          };

          if (activeServerSessionId) {
            // Update the existing server session.
            await updateSession(activeServerSessionId, payload);
          } else {
            // First time going to background — create the server session.
            const created = await createSession(payload);
            if (created && activeConversationId) {
              setActiveServerSessionId(created.id);
              // Also stamp the local conversation with the server session ID.
              chatStore.setConversationServerSessionId(activeConversationId, created.id);
              await chatStore.flushPendingPersistence();
            }
          }
        }

        await useChatStore.getState().flushPendingPersistence();
      }

      if (nextState === 'active' && appState.current !== 'active') {
        // Resume engagement tracking when app returns to foreground.
        EngagementService.startSession();

        // App returned to foreground — mark session active again.
        const { activeServerSessionId, updateSession } = useSessionStore.getState();
        if (activeServerSessionId) {
          await updateSession(activeServerSessionId, { status: 'active' });
        }
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  // Block all screen rendering until auth state is fully resolved.
  // Without this guard, screen content renders immediately and is briefly visible
  // during sessionLoading before the redirect useEffect has a chance to fire.
  if (!navigationState?.key || sessionLoading) {
    return <LoadingScreen backgroundColor="#032C2C" tintColor="#ffffff" />;
  }

  if (sessionError) {
    return (
      <SessionErrorScreen
        backgroundColor="#032C2C"
        onRetry={() => { restoreSession(); }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Resume prompt modal — rendered at the drawer level so it floats above all screens */}
      <ResumeSessionModal />
      {/* Profile completion reminder for patients with incomplete health profiles */}
      <ProfileReminderBanner
        visible={showProfileReminder}
        onDismiss={() => setProfileReminderDismissed(true)}
      />
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerActiveTintColor: '#0AADA2',
          drawerInactiveTintColor: '#999',
          drawerLabelStyle: { marginLeft: -20, fontSize: 16 },
          drawerStyle: {
            backgroundColor: '#fff',
            width: 280,
          },
          overlayColor: 'rgba(0, 0, 0, 0.5)',
        }}
        drawerContent={CustomDrawerContent}
      >
        {/* ChatScreen - Primary screen (first shown after login) */}
        <Drawer.Screen
          name="chatScreen"
          options={{
            title: 'Chat',
            drawerLabel: 'Chat',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="chatbubble" size={size} color={color} />
            ),
          }}
        />
        {/* Patient Profile Screen */}
        <Drawer.Screen
          name="profile"
          options={{
            title: 'Patient Profile',
            drawerLabel: 'Profile',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person-circle" size={size} color={color} />
            ),
          }}
        />
        {/* Health History & Alerts */}
        <Drawer.Screen
          name="health"
          options={{
            title: 'Health History',
            drawerLabel: 'Health History',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="heart-outline" size={size} color={color} />
            ),
          }}
        />
        {/* Eye Test */}
        <Drawer.Screen
          name="eyetest"
          options={{
            title: 'Eye Test',
            drawerLabel: 'Eye Test',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="eye-outline" size={size} color={color} />
            ),
          }}
        />
        {/* Hearing Test */}
        <Drawer.Screen
          name="hearingtest"
          options={{
            title: 'Hearing Test',
            drawerLabel: 'Hearing Test',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="ear-outline" size={size} color={color} />
            ),
          }}
        />
      </Drawer>
      {/* In-app banner — rendered AFTER Drawer so it appears on top */}
      <InAppNotificationBanner notification={banner} onDismiss={handleDismissBanner} onPress={handleBannerPress} />
      {liveIM && (
        <InstantMessageModal
          diagnosisId={liveIM.diagnosisId}
          counterpartName={liveIM.counterpartName}
          perspective="patient"
          onClose={() => setLiveIM(null)}
        />
      )}
    </GestureHandlerRootView>
  );
}
