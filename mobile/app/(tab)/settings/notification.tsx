import {
  View,
  Text,
  Pressable,
  AppState,
  AppStateStatus,
  Linking,
  ScrollView,
  Platform,
  Alert,
  StyleSheet,
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