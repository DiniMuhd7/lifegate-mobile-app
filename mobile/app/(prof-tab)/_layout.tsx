import { Stack, useRouter, router, useRootNavigationState } from 'expo-router';
import { View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomTabBar } from '../../components/BottomTabBar';
import { usePhysicianWebSocket } from '../../utils/useWebSocket';
import { InAppNotificationBanner } from '../../components/InAppNotificationBanner';
import { useNotificationStore, PhysicianNotification } from '../../stores/notification-store';
import { registerPhysicianPushToken, addNotificationResponseListener } from '../../utils/pushNotifications';
import { useAuthStore } from 'stores/auth-store';
import wsService from 'services/websocket-service';
import { getToken } from 'utils/tokenStorage';

export default function ProfTabLayout() {
  const router = useRouter();
  const [banner, setBanner] = useState<PhysicianNotification | null>(null);

  // Mount physician real-time events
  usePhysicianWebSocket();

  // Subscribe to new notifications so we can show the banner
  useEffect(() => {
    const unsub = useNotificationStore.subscribe((state) => {
      const latest = state.notifications[0];
      if (latest && !latest.isRead) setBanner((prev) => (prev?.id === latest.id ? prev : latest));
    });
    return unsub;
  }, []);

  // Register push token once on mount
  useEffect(() => {
    registerPhysicianPushToken().catch(() => {/* best-effort */});
  }, []);

  // Handle push notification tap → navigate to case
  useEffect(() => {
    const sub = addNotificationResponseListener((caseId) => {
      router.push({ pathname: '/(prof-tab)/caseQueue', params: { caseId } });
    });
    return () => sub.remove();
  }, [router]);

  // Connect wsService so the IM modal read-receipts/typing work
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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

  // ── Auth guard ────────────────────────────────────────────────────────────
  const authUser = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
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
      <InAppNotificationBanner notification={banner} onDismiss={handleDismissBanner} />

      {/* Bottom Tab Bar — active tab is auto-detected from the current pathname */}
      <BottomTabBar />
    </View>
  );
}


