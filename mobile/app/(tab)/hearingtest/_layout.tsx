import { Stack } from 'expo-router';

export default function HearingTestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pta" />
      <Stack.Screen name="sin" />
      <Stack.Screen name="hf" />
      <Stack.Screen name="results" />
    </Stack>
  );
}
