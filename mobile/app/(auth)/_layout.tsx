import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { LoadingScreen } from 'components/LoadingScreen';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const sessionLoading = useAuthStore((s) => s.sessionLoading);
  const navigationState = useRootNavigationState();

  // Block hardware back from reaching intro/welcome/splash.
  // Within the auth group, back is allowed between screens (e.g. login → forgot-password)
  // but must never escape to unauthenticated pre-auth screens.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        // Let Expo Router consume this back action to avoid dispatching a
        // manual back action during transient navigator state updates.
        return false;
      }
      // At root of auth group — exit app rather than going back to intro/welcome.
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

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

  // Block auth screens from rendering while session state is loading.
  // Prevents a briefly-authenticated user from seeing login/register screens,
  // and prevents an unauthenticated deep-link from showing protected content.
  if (!navigationState?.key || sessionLoading) {
    return <LoadingScreen backgroundColor="#043B3C" tintColor="#ffffff" />;
  }

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