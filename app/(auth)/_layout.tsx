// File: app/_layout.tsx
 // Ensure global styles are applied to all screens
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}