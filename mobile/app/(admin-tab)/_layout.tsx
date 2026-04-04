import { Stack } from 'expo-router';
import { useAdminWebSocket } from '../../utils/useWebSocket';

export default function AdminTabLayout() {
  useAdminWebSocket();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f8fafc' } }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="physicians" />
      <Stack.Screen name="physician-detail" />
      <Stack.Screen name="alert-settings" />
    </Stack>
  );
}
