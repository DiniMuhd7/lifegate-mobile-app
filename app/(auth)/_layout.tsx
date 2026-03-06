import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register-choice" />
      <Stack.Screen name="(user)" />
      <Stack.Screen name="(health-professional)" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="verify-signup-otp" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}