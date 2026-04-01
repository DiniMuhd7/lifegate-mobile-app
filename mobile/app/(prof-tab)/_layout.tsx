import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { BottomTabBar, type TabBarTab } from '../../components/BottomTabBar';
import { usePhysicianWebSocket } from '../../utils/useWebSocket';
import { InAppNotificationBanner } from '../../components/InAppNotificationBanner';
import { useNotificationStore, PhysicianNotification } from '../../stores/notification-store';
import { registerPhysicianPushToken, addNotificationResponseListener } from '../../utils/pushNotifications';

export default function ProfTabLayout() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<TabBarTab>('review');
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

  const handleDismissBanner = useCallback(() => setBanner(null), []);

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

      {/* Bottom Tab Bar */}
      <BottomTabBar currentTab={currentTab} onTabChange={setCurrentTab} />
    </View>
  );
}


