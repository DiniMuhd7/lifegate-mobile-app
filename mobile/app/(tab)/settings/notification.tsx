import { View, Text, Pressable, AppState, AppStateStatus, Linking, ScrollView, Platform, Alert } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';

async function getPermissionStatus(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  }
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export default function NotificationScreen() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const permissionTone = enabled
    ? {
        label: 'Active',
        cardBg: '#ECFDF5',
        cardBorder: '#A7F3D0',
        text: '#065F46',
      }
    : {
        label: 'Inactive',
        cardBg: '#FFFBEB',
        cardBorder: '#FDE68A',
        text: '#92400E',
      };

  // Read the real OS permission state on mount and whenever the app comes back to
  // foreground (in case the user toggled it in system settings).
  useEffect(() => {
    getPermissionStatus().then(setEnabled);

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        getPermissionStatus().then(setEnabled);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        // Permissions cannot be revoked in-app on either platform.
        if (Platform.OS === 'web') {
          Alert.alert(
            'Turn Off Notifications',
            'To turn off notifications, use your browser site settings for this app and set notifications to Block.'
          );
        } else {
          const opened = await Linking.openSettings();
          if (!opened) {
            Alert.alert('Unavailable', 'Could not open device settings. Please open Settings manually.');
          }
        }
        return;
      }

      if (Platform.OS === 'web') {
        if (typeof Notification === 'undefined') {
          Alert.alert('Unsupported', 'This browser does not support push notification permissions.');
          return;
        }
        const status = await Notification.requestPermission();
        setEnabled(status === 'granted');

        if (status !== 'granted') {
          Alert.alert(
            'Permission Not Granted',
            'Notifications are blocked in this browser. Allow notifications from browser site settings to enable them.'
          );
        }
        return;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      setEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow notifications in device settings to enable alerts.');
      }
    } catch {
      Alert.alert('Error', 'Could not update notification permission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDeviceSettings = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Browser Settings',
        'Open your browser site settings for this app to manage notifications.\n\nExample: click the lock icon in the address bar -> Site settings -> Notifications.'
      );
      return;
    }

    const opened = await Linking.openSettings();
    if (!opened) {
      Alert.alert('Unavailable', 'Could not open device settings. Please open Settings manually.');
    }
  };

  const NotificationToggle = () => (
    <Pressable
      onPress={handleToggle}
      className="flex-row items-center justify-between py-4 px-4 bg-white rounded-2xl border border-[#E4EEEE] active:opacity-80">
      <View className="flex-row items-center flex-1">
        <View className="h-10 w-10 rounded-full bg-[#E8F6F6] items-center justify-center">
          <Ionicons name="notifications-outline" size={18} color="#0EA5A4" />
        </View>
        <View className="ml-3">
          <Text className="text-base font-semibold text-gray-900">Push Notifications</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            Alerts for diagnoses, follow-ups, and account updates
          </Text>
        </View>
      </View>
      <View
        className={`h-7 w-14 rounded-full flex-row items-center px-1 ${busy ? 'opacity-60' : ''} ${
          enabled ? 'bg-[#0EA5A4]' : 'bg-gray-300'
        }`}>
        <View
          className={`h-6 w-6 rounded-full bg-white ${enabled ? 'ml-auto' : ''}`}
        />
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">Notifications</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
        <View
          className="rounded-2xl px-4 py-4 mb-4 border"
          style={{ backgroundColor: permissionTone.cardBg, borderColor: permissionTone.cardBorder }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons
                name={enabled ? 'notifications' : 'notifications-off'}
                size={18}
                color={permissionTone.text}
              />
              <Text className="text-sm font-semibold" style={{ color: permissionTone.text }}>
                Notification Status
              </Text>
            </View>
            <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFFFFF99' }}>
              <Text className="text-xs font-bold" style={{ color: permissionTone.text }}>
                {permissionTone.label}
              </Text>
            </View>
          </View>
          <Text className="text-sm mt-2 leading-5" style={{ color: permissionTone.text }}>
            {enabled
              ? 'You will receive important alerts for follow-ups, escalations, and physician updates.'
              : 'Turn this on to avoid missing critical care reminders and case status changes.'}
          </Text>
        </View>

        <View className="rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4 mb-4">
          <View className="flex-row items-start gap-3">
            <Ionicons name="shield-checkmark-outline" size={20} color="#0EA5A4" style={{ marginTop: 1 }} />
            <Text className="flex-1 text-sm text-gray-700 leading-5">
              Stay informed about urgent medical updates and care reminders in real time.
            </Text>
          </View>
        </View>

        <NotificationToggle />

        <View className="mt-5 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-sm font-semibold text-gray-900 mb-1">Permission Status</Text>
          <Text className="text-sm text-gray-600">
            {enabled ? 'Enabled on this device' : 'Disabled. Tap the switch to enable.'}
          </Text>

          <View className="mt-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">What You Will Receive</Text>
            <Text className="text-sm text-gray-600">• Escalation alerts for urgent cases</Text>
            <Text className="text-sm text-gray-600 mt-1">• Follow-up reminders and schedules</Text>
            <Text className="text-sm text-gray-600 mt-1">• Account and physician response updates</Text>
          </View>

          <Pressable
            onPress={handleOpenDeviceSettings}
            className="mt-4 h-10 rounded-xl bg-[#F0F8F8] border border-[#D8EBEB] items-center justify-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-[#0EA5A4]">Open Device Settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}