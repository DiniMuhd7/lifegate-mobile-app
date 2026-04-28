import { useEffect } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;
    if (sessionLoading) return;
    if (isAuthenticated) {
      if (user?.role === 'admin') {
        router.replace('/(admin-tab)/dashboard');
      } else if (user?.role === 'professional') {
        if (user.mdcn_verified) {
          router.replace('/(prof-tab)/review');
        } else {
          router.replace('/physician-pending');
        }
      } else {
        router.replace('/(tab)/health');
      }
    }
  }, [navigationState?.key, isAuthenticated, user, sessionLoading]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="register-choice" />
      <Stack.Screen name="(user)" />
      <Stack.Screen name="(health-professional)" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="verify-signup-otp" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="mdcn-verify" />
    </Stack>
  );
}