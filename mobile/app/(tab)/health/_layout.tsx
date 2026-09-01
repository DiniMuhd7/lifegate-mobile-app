import { Stack } from 'expo-router';

export default function HealthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="timeline" />
      <Stack.Screen name="report" />
      <Stack.Screen name="alerts" />
      <Stack.Screen name="checkins" />
      <Stack.Screen name="survey" />
      <Stack.Screen name="offers" />
      <Stack.Screen name="explore" />
      <Stack.Screen name="referrals" />
      <Stack.Screen name="lifefund" />
      <Stack.Screen name="lifefund-detail" />
    </Stack>
  );
}
