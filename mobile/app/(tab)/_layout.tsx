/**
 * Tab Layout with Drawer Navigation
 * - ChatScreen as primary (first screen after login)
 * - HomeScreen as secondary
 * - ConversationDrawer as side drawer for conversation history
 */

import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConversationDrawer } from 'components/ConversationDrawer';
import { ResumeSessionModal } from 'components/ResumeSessionModal';
import { ProfileReminderBanner } from 'components/ProfileReminderBanner';
import { Ionicons } from '@expo/vector-icons';
import { useDiagnosisWebSocket } from 'utils/useWebSocket';
import { useChatStore } from '@/stores/chat-store';
import { useSessionStore } from '@/stores/session-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { User } from 'types/auth-types';

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

  // ── Health profile reminder ────────────────────────────────────────────────
  const user = useAuthStore((s) => s.user);
  const [profileReminderDismissed, setProfileReminderDismissed] = useState(false);
  const showProfileReminder = !profileReminderDismissed && isHealthProfileIncomplete(user);

  // ── Abandoned-session detection (save state when app goes to background) ──
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // ── Block back navigation to auth/splash screens ──────────────────────────
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      // At the root of the authenticated area — exit the app cleanly
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
      </Drawer>
    </GestureHandlerRootView>
  );
}
