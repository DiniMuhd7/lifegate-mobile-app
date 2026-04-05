import { Stack } from 'expo-router';

export default function HealthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="timeline" />
      <Stack.Screen name="alerts" />
    </Stack>
  );
}
