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
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWebPushStatus, registerWebPush, unregisterWebPush } from 'services/webPushRegistration';

async function getPermissionStatus(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const status = await getWebPushStatus();
    // Consider "granted" permission (even without an active push subscription)
    // as effectively enabled so the status card reflects reality.
    return status.subscribed || status.permission === 'granted';
  }
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function autoRequestPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const status = await getWebPushStatus();
      if (!status.supported) return false;
      // Only auto-request if permission is still undecided (default)
      if (status.permission === 'denied') return false;
      if (status.subscribed) return true;
      return await registerWebPush();
    }
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function ToggleSwitch({ value, busy }: { value: boolean; busy: boolean }) {
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: value ? '#0EA5A4' : '#CBD5E1' },
        busy && { opacity: 0.5 },
      ]}
    >
      <View
        style={[
          styles.knob,
          { transform: [{ translateX: value ? 22 : 2 }] },
        ]}
      />
    </View>
  );
}

export default function NotificationScreen() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const tone = enabled
    ? { label: 'Active', cardBg: '#ECFDF5', cardBorder: '#6EE7B7', text: '#065F46', dot: '#10B981' }
    : { label: 'Inactive', cardBg: '#FFF7ED', cardBorder: '#FCD34D', text: '#92400E', dot: '#F59E0B' };

  // On mount: read real OS state, then auto-request if still undecided.
  useEffect(() => {
    (async () => {
      const already = await getPermissionStatus();
      if (already) {
        setEnabled(true);
        setInitialised(true);
        return;
      }
      // Auto-request permission the first time the screen opens.
      setBusy(true);
      const granted = await autoRequestPermission();
      setEnabled(granted);
      setBusy(false);
      setInitialised(true);
    })();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        getPermissionStatus().then(setEnabled);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleToggle = async () => {
    if (busy || !initialised) return;
    setBusy(true);
    try {
      if (enabled) {
        if (Platform.OS === 'web') {
          await unregisterWebPush();
          setEnabled(false);
        } else {
          await Linking.openSettings();
        }
        return;
      }

      if (Platform.OS === 'web') {
        const status = await getWebPushStatus();
        if (!status.supported) {
          Alert.alert('Unsupported', 'This browser does not support push notifications.');
          return;
        }
        if (status.permission === 'denied') {
          Alert.alert(
            'Blocked by Browser',
            'Notifications are blocked in your browser. Open the site settings for this page and allow notifications, then return here.',
          );
          return;
        }
        const ok = await registerWebPush();
        setEnabled(ok);
        if (!ok) {
          Alert.alert('Permission Not Granted', 'Could not enable notifications. Please allow them in your browser settings.');
        }
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
      Alert.alert(
        'Browser Settings',
        'Click the lock icon in the address bar → Site settings → Notifications → Allow.',
      );
      return;
    }
    const opened = await Linking.openSettings();
    if (!opened) {
      Alert.alert('Unavailable', 'Could not open device settings. Please open Settings manually.');
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View style={[styles.statusCard, { backgroundColor: tone.cardBg, borderColor: tone.cardBorder }]}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
              <Text style={[styles.statusTitle, { color: tone.text }]}>Notification Status</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: tone.dot + '22' }]}>
              <Text style={[styles.statusBadgeText, { color: tone.text }]}>{tone.label}</Text>
            </View>
          </View>
          <Text style={[styles.statusBody, { color: tone.text }]}>
            {enabled
              ? 'You will receive real-time alerts for follow-ups, escalations, and physician updates.'
              : 'Enable notifications to stay on top of critical care reminders and case status changes.'}
          </Text>
        </View>

        {/* Info strip */}
        <View style={styles.infoStrip}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#0EA5A4" />
          <Text style={styles.infoText}>
            Stay informed about urgent medical updates and care reminders in real time.
          </Text>
        </View>

        {/* Toggle row */}
        <Pressable
          onPress={handleToggle}
          style={({ pressed }) => [styles.toggleCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled, busy }}
        >
          <View style={styles.toggleIconWrap}>
            <Ionicons name="notifications-outline" size={20} color="#0EA5A4" />
          </View>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleLabel}>Push Notifications</Text>
            <Text style={styles.toggleSub}>Diagnoses, follow-ups &amp; account updates</Text>
          </View>
          <ToggleSwitch value={enabled} busy={busy} />
        </Pressable>

        {/* Details card */}
        <View style={styles.detailCard}>
          <View style={styles.detailPermRow}>
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={enabled ? '#10B981' : '#F59E0B'}
            />
            <Text style={styles.detailPermText}>
              {enabled ? 'Enabled on this device' : 'Disabled — tap the switch above to enable'}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.detailSectionLabel}>What you will receive</Text>
          {[
            'Escalation alerts for urgent cases',
            'Follow-up reminders and schedules',
            'Physician response and case updates',
            'Appointment and account notifications',
          ].map((item) => (
            <View key={item} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}

          <Pressable
            onPress={handleOpenDeviceSettings}
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="settings-outline" size={15} color="#0EA5A4" />
            <Text style={styles.settingsBtnText}>Open Device Settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F8F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scroll: { flex: 1, paddingHorizontal: 16 },

  // Status card
  statusCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: { fontSize: 14, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBody: { fontSize: 13, lineHeight: 20 },

  // Info strip
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#E6F7F6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BEECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },

  // Toggle card
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAF0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  toggleIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F6F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  toggleTextWrap: { flex: 1, marginRight: 14 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#6B7280', lineHeight: 17 },

  // Toggle switch
  track: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    flexShrink: 0,
  },
  knob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  // Details card
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAF0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  detailPermRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  detailPermText: { fontSize: 13, color: '#374151', flex: 1 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 },
  detailSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0EA5A4', flexShrink: 0 },
  bulletText: { fontSize: 13, color: '#4B5563', flex: 1 },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F0F9F9',
    borderWidth: 1,
    borderColor: '#C7E8E7',
  },
  settingsBtnText: { fontSize: 13, fontWeight: '700', color: '#0EA5A4' },
});