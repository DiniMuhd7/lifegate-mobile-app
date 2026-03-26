// File: app/_layout.tsx
import '../global.css' // Ensure global styles are applied to all screens
import { Stack } from 'expo-router';

export default function RootLayout() {

  
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Splash first */}
      <Stack.Screen name="index" />
    </Stack>
  );
}