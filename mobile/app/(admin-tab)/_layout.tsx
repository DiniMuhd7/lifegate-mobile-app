import { useEffect, useRef } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { useAdminWebSocket } from '../../utils/useWebSocket';
import wsService from 'services/websocket-service';
import { getToken } from 'utils/tokenStorage';

export default function AdminTabLayout() {
  useAdminWebSocket();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
  const navigationState = useRootNavigationState();

  // Connect wsService so the admin WebSocket hook can receive events
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

  useEffect(() => {
    if (!navigationState?.key) return;
    if (sessionLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else if (user?.role !== 'admin') {
      if (user?.role === 'professional') {
        router.replace('/(prof-tab)/review');
      } else {
        router.replace('/(tab)/chatScreen');
      }
    }
  }, [navigationState?.key, isAuthenticated, user, sessionLoading]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f8fafc' } }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="physicians" />
      <Stack.Screen name="physician-detail" />
      <Stack.Screen name="alert-settings" />
    </Stack>
  );
}
