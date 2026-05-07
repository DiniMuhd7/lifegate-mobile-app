import { Stack } from "expo-router";

export default function UserSettingsLayout() {
  return (
    <Stack
    screenOptions={
      {
        headerShown: false,
      }
    }
    >
      <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="manage-profile" />
        <Stack.Screen name="notification" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="contact-us" />
        <Stack.Screen name="help-center" />
        <Stack.Screen name="payment-failed" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="account-setting" />
        <Stack.Screen name="accessibility" />
    </Stack>
  );
}
