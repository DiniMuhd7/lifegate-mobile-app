import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);

  useEffect(() => {
    if (sessionLoading) return;
    if (isAuthenticated) {
      if (user?.role === 'admin') {
        router.replace('/(admin-tab)/dashboard');
      } else if (user?.role === 'professional') {
        router.replace('/(prof-tab)/consultation');
      } else {
        router.replace('/(tab)/chatScreen');
      }
    }
  }, [isAuthenticated, user, sessionLoading]);

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