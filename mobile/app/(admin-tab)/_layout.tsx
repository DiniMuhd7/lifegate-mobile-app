import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { useAdminWebSocket } from '../../utils/useWebSocket';

export default function AdminTabLayout() {
  useAdminWebSocket();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);

  useEffect(() => {
    if (sessionLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (user?.role !== 'admin') {
      if (user?.role === 'professional') {
        router.replace('/(prof-tab)/consultation');
      } else {
        router.replace('/(tab)/chatScreen');
      }
    }
  }, [isAuthenticated, user, sessionLoading]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f8fafc' } }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="physicians" />
      <Stack.Screen name="physician-detail" />
      <Stack.Screen name="alert-settings" />
    </Stack>
  );
}
