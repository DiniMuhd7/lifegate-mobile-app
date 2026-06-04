import {
  View,
  Text,
  Pressable,
  Switch,
  AppState,
  AppStateStatus,
  Linking,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWebPushStatus, registerWebPush, unregisterWebPush } from 'services/webPushRegistration';

async function getPermissionStatus(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const status = await getWebPushStatus();
    return status.subscribed || status.permission === 'granted';
  }
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function requestPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const status = await getWebPushStatus();
      if (!status.supported || status.permission === 'denied') return false;
      if (status.subscribed) return true;
      return await registerWebPush();
    }
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export default function NotificationScreen() {
  // Start optimistically enabled to avoid a "Inactive" flash on load.
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // On mount: auto-request permission, then reconcile state with OS reality.
  useEffect(() => {
    setBusy(true);
    (async () => {
      const already = await getPermissionStatus();
      if (already) {
        setEnabled(true);
        setBusy(false);
        return;
      }
      // Not yet granted — request it now.
      const granted = await requestPermission();
      setEnabled(granted);
      setBusy(false);
    })();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        getPermissionStatus().then(setEnabled);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleToggle = async (value: boolean) => {
    if (busy) return;
    if (!value) {
      // Turning off
      if (Platform.OS === 'web') {
        setBusy(true);
        await unregisterWebPush();
        setEnabled(false);
        setBusy(false);
      } else {
        Alert.alert(
          'Disable Notifications',
          'To disable notifications, open your device settings for this app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
      return;
    }
    // Turning on
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const status = await getWebPushStatus();
        if (!status.supported) {
          Alert.alert('Unsupported', 'This browser does not support push notifications.');
          return;
        }
        if (status.permission === 'denied') {
          Alert.alert(
            'Blocked by Browser',
            'Notifications are blocked in your browser. Click the lock icon in the address bar → Site settings → Notifications → Allow.',
          );
          return;
        }
        const ok = await registerWebPush();
        setEnabled(ok);
        return;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      setEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow notifications in device settings to receive health alerts.');
      }
    } catch {
      Alert.alert('Error', 'Could not update notification settings. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDeviceSettings = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Browser Settings', 'Click the lock icon in the address bar → Site settings → Notifications → Allow.');
      return;
    }
    await Linking.openSettings();
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      {/* Header — matches every other settings page */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">Notifications</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View className="mb-4 rounded-3xl bg-white border border-[#DCEFEF] p-5 overflow-hidden">
          <View className="absolute -top-8 -right-4 h-24 w-24 rounded-full bg-[#E7F8F7]" />
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">Alerts & Updates</Text>
          <Text className="text-2xl font-black text-gray-900 mb-2">Stay informed about your care</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Enable push notifications to receive real-time alerts for diagnoses, follow-ups, escalations, and physician updates.
          </Text>
        </View>

        {/* Status banner */}
        <View className={`mb-3 rounded-2xl border px-4 py-4 ${enabled ? 'bg-[#ECFDF5] border-[#6EE7B7]' : 'bg-[#FFF7ED] border-[#FCD34D]'}`}>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <View className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-[#10B981]' : 'bg-[#F59E0B]'}`} />
              <Text className={`text-sm font-bold ${enabled ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                Notification Status
              </Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${enabled ? 'bg-[#D1FAE5]' : 'bg-[#FEF3C7]'}`}>
              <Text className={`text-xs font-bold ${enabled ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                {enabled ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
          <Text className={`text-sm leading-5 ${enabled ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
            {enabled
              ? 'You will receive real-time alerts for follow-ups, escalations, and physician updates.'
              : 'Enable notifications to stay on top of critical care reminders and case status changes.'}
          </Text>
        </View>

        {/* Toggle row — matches accessibility.tsx PreferenceRow pattern */}
        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-2">
          <View className="flex-row items-center py-4">
            <View className="h-10 w-10 rounded-full bg-[#E9F8F7] items-center justify-center mr-3">
              <Ionicons name="notifications-outline" size={18} color="#0EA5A4" />
            </View>
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-gray-900">Push Notifications</Text>
              <Text className="text-sm text-gray-600 mt-1 leading-5">
                Diagnoses, follow-ups, and account updates
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              disabled={busy}
              thumbColor="#ffffff"
              trackColor={{ false: '#D1D5DB', true: '#14B8A6' }}
            />
          </View>
        </View>

        {/* Info strip */}
        <View className="mb-3 rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0B8E8D] mb-2">What you will receive</Text>
          {[
            { icon: 'alert-circle-outline' as const, text: 'Escalation alerts for urgent cases' },
            { icon: 'calendar-outline' as const, text: 'Follow-up reminders and schedules' },
            { icon: 'chatbubble-ellipses-outline' as const, text: 'Physician response and case updates' },
            { icon: 'person-circle-outline' as const, text: 'Appointment and account notifications' },
          ].map(({ icon, text }) => (
            <View key={text} className="flex-row items-start py-2.5">
              <View className="h-8 w-8 rounded-full bg-[#F4FAFA] items-center justify-center mr-3 mt-0.5">
                <Ionicons name={icon} size={16} color="#0EA5A4" />
              </View>
              <Text className="flex-1 text-sm text-gray-700 leading-5">{text}</Text>
            </View>
          ))}
        </View>

        {/* Permission status + device settings button */}
        <View className="mb-2 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <View className="flex-row items-center gap-2 mb-4">
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={enabled ? '#10B981' : '#F59E0B'}
            />
            <Text className="text-sm text-gray-600 flex-1">
              {enabled ? 'Enabled on this device' : 'Disabled — tap the switch above to enable'}
            </Text>
          </View>

          <Pressable
            onPress={handleOpenDeviceSettings}
            className="h-11 rounded-xl bg-[#F0F9F9] border border-[#C7E8E7] flex-row items-center justify-center gap-2 active:opacity-80"
          >
            <Ionicons name="settings-outline" size={15} color="#0EA5A4" />
            <Text className="text-sm font-bold text-[#0EA5A4]">Open Device Settings</Text>
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
