import { Stack, useRouter, router, useRootNavigationState } from 'expo-router';
import { View } from 'react-native';
import { LoadingScreen } from 'components/LoadingScreen';
import { SessionErrorScreen } from 'components/SessionErrorScreen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomTabBar } from '../../components/BottomTabBar';
import { usePhysicianWebSocket } from '../../utils/useWebSocket';
import { InAppNotificationBanner } from '../../components/InAppNotificationBanner';
import { InstantMessageModal } from '../../components/InstantMessageModal';
import { useNotificationStore, PhysicianNotification } from '../../stores/notification-store';
import { registerPhysicianPushToken, addNotificationResponseListener, addNotificationReceivedListener } from '../../utils/pushNotifications';
import { registerWebPush } from 'services/webPushRegistration';
import { useAuthStore } from 'stores/auth-store';
import wsService from 'services/websocket-service';
import { getToken } from 'utils/tokenStorage';
import { IMMessage } from 'types/im-types';

export default function ProfTabLayout() {
  const router = useRouter();
  const [banner, setBanner] = useState<PhysicianNotification | null>(null);
  const [liveIM, setLiveIM] = useState<{ diagnosisId: string; counterpartName: string } | null>(null);
  const lastIMPopupAtRef = useRef(0);
  const IM_POPUP_COOLDOWN_MS = 3000;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Mount physician real-time events
  usePhysicianWebSocket();

  // Subscribe to new notifications so we can show the banner.
  // For IM messages, prefer the most recent unread im_message even if a
  // newer non-IM notification has been prepended ahead of it.
  // For checkin_update, surface it like any other notification.
  useEffect(() => {
    const unsub = useNotificationStore.subscribe((state) => {
      const latestIM = state.notifications.find(
        (n) => !n.isRead && n.type === 'im_message',
      );
      const latestAny = state.notifications.find((n) => !n.isRead);
      // IM messages take priority; fall back to any unread notification.
      const candidate = latestIM ?? latestAny ?? null;
      if (candidate) {
        setBanner((prev) => (prev?.id === candidate.id ? prev : candidate));
      }
    });
    return unsub;
  }, []);

  // Register push token once after authentication
  useEffect(() => {
    if (!isAuthenticated) return;
    registerPhysicianPushToken().catch(() => {/* best-effort */});
    registerWebPush().catch(() => {/* best-effort */});
  }, [isAuthenticated]);

  // Handle push notification tap → navigate to case
  useEffect(() => {
    const sub = addNotificationResponseListener((caseId) => {
      router.push({ pathname: '/(prof-tab)/caseQueue', params: { caseId } });
    });
    return () => sub.remove();
  }, [router]);

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

  // Auto-open IM modal for incoming patient messages (debounced for bursts).
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubIncomingIM = wsService.on('im.message', (data) => {
      const msg = data as IMMessage;
      if (!msg?.diagnosis_id) return;

      const now = Date.now();
      if (now - lastIMPopupAtRef.current < IM_POPUP_COOLDOWN_MS) return;
      lastIMPopupAtRef.current = now;

      setLiveIM((prev) => {
        if (prev?.diagnosisId === msg.diagnosis_id) return prev;
        return {
          diagnosisId: msg.diagnosis_id,
          counterpartName: msg.sender_name || 'Patient',
        };
      });
    });

    return () => unsubIncomingIM();
  }, [isAuthenticated]);

  // Connect wsService so the IM modal read-receipts/typing work
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

  const handleDismissBanner = useCallback(() => setBanner(null), []);

  const handleBannerPress = useCallback(() => {
    if (banner?.type === 'im_message' && banner.caseId) {
      router.push({
        pathname: '/(prof-tab)/caseReview',
        params: { id: banner.caseId, openIM: 'true' },
      });
    } else if (banner?.type === 'checkin_update' && banner.patientId) {
      router.push({
        pathname: '/(prof-tab)/patientProfile',
        params: { patientId: banner.patientId },
      });
    } else if (banner?.caseId) {
      router.push({ pathname: '/(prof-tab)/caseQueue', params: { caseId: banner.caseId } });
    }
    setBanner(null);
  }, [banner, router]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  const authUser = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
  const sessionError = useAuthStore((s) => s.sessionError);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;
    if (sessionLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (authUser?.role !== 'professional') {
      if (authUser?.role === 'admin') {
        router.replace('/(admin-tab)/dashboard');
      } else {
        router.replace('/(tab)/chatScreen');
      }
    } else if (!authUser?.mdcn_verified) {
      // Physician is authenticated but not yet verified — hold on pending screen.
      router.replace('/physician-pending');
    }
  }, [navigationState?.key, isAuthenticated, authUser, sessionLoading]);

  // Block all screen rendering until auth state is fully resolved.
  if (!navigationState?.key || sessionLoading) {
    return <LoadingScreen backgroundColor="#fff" tintColor="#0AADA2" message="Loading physician portal…" />;
  }

  if (sessionError) {
    return (
      <SessionErrorScreen
        backgroundColor="#fff"
        darkText
        onRetry={() => { restoreSession(); }}
      />
    );
  }

  return (
    <View className="flex-1 bg-white">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#fff' },
        }}
      >
        <Stack.Screen name="review" />
        <Stack.Screen name="consultation" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="notification" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="patientHistory" />
        <Stack.Screen name="caseQueue" />
        <Stack.Screen name="caseReview" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="caseHistory" />
      </Stack>

      {/* In-app notification banner (overlays content) */}
      <InAppNotificationBanner notification={banner} onDismiss={handleDismissBanner} onPress={handleBannerPress} />

      {liveIM && (
        <InstantMessageModal
          diagnosisId={liveIM.diagnosisId}
          counterpartName={liveIM.counterpartName}
          perspective="physician"
          onClose={() => setLiveIM(null)}
        />
      )}

      {/* Bottom Tab Bar — active tab is auto-detected from the current pathname */}
      <BottomTabBar />
    </View>
  );
}


