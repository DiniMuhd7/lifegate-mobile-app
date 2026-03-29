import { Stack } from 'expo-router';

export default function AuthLayout() {
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