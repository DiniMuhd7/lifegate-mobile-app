import { Stack } from 'expo-router';

export default function EyeTestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="battery" />
      <Stack.Screen name="acuity" />
      <Stack.Screen name="color" />
      <Stack.Screen name="astigmatism" />
      <Stack.Screen name="contrast" />
      <Stack.Screen name="near" />
      <Stack.Screen name="battery-results" />
      <Stack.Screen name="test" />
      <Stack.Screen name="results" />
    </Stack>
  );
}
