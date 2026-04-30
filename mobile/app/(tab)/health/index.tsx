import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHealthStore } from 'stores/health-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { scheduleHealthInsightNotification } from 'utils/pushNotifications';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { GreetingSection } from 'components/GreetingSection';
import Logo from 'assets/logo.svg';
import type { HealthTimelineEntry } from 'types/health-types';

// ─── Status config ────────────────────────────────────────────────────────────

type HealthStatus = 'Stable' | 'Monitor' | 'High Risk';

const STATUS_CFG: Record<
  HealthStatus,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bg: string;
    border: string;
    gradientFrom: string;
    gradientTo: string;
    dot: string;
  }
> = {
  Stable: {
    label: 'Stable',
    icon: 'shield-checkmark',
    color: '#15803d',
    bg: '#f0fdf4',
    border: '#86efac',
    gradientFrom: '#d1fae5',
    gradientTo: '#f0fdf4',
    dot: '#22c55e',
  },
  Monitor: {
    label: 'Monitor',
    icon: 'eye',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    gradientFrom: '#fef3c7',
    gradientTo: '#fffbeb',
    dot: '#f59e0b',
  },
  'High Risk': {
    label: 'High Risk',
    icon: 'warning',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    gradientFrom: '#fee2e2',
    gradientTo: '#fef2f2',
    dot: '#ef4444',
  },
};

const URGENCY_STATUS: Record<string, HealthStatus> = {
  LOW: 'Stable',
  MEDIUM: 'Monitor',
  HIGH: 'High Risk',
  CRITICAL: 'High Risk',
};

// Richer dark gradients for the greeting card (separate from the light pastel
// gradients used in HealthStatusCard which are designed for a white page).
const GREETING_GRADIENT: Record<HealthStatus, [string, string]> & { default: [string, string] } = {
  Stable:      ['#16a34a', '#14532d'],
  Monitor:     ['#d97706', '#78350f'],
  'High Risk': ['#dc2626', '#7f1d1d'],
  default:     ['#0AADA2', '#043B3C'],
};

const GREETING_STATUS_ICON: Record<HealthStatus, React.ComponentProps<typeof Ionicons>['name']> = {
  Stable:      'shield-checkmark',
  Monitor:     'eye',
  'High Risk': 'warning',
};

const URGENCY_COLOR: Record<string, string> = {
  LOW: '#16a34a',
  MEDIUM: '#d97706',
  HIGH: '#dc2626',
  CRITICAL: '#7c3aed',
};

const URGENCY_BG: Record<string, string> = {
  LOW: '#f0fdf4',
  MEDIUM: '#fffbeb',
  HIGH: '#fef2f2',
  CRITICAL: '#faf5ff',
};

const URGENCY_BORDER: Record<string, string> = {
  LOW: '#bbf7d0',
  MEDIUM: '#fde68a',
  HIGH: '#fecaca',
  CRITICAL: '#ddd6fe',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStatus(entries: HealthTimelineEntry[]): HealthStatus {
  const active = entries.filter((e) => e.status !== 'Completed');
  const latest = active.length > 0 ? active[0] : entries[0];
  if (!latest) return 'Stable';
  return URGENCY_STATUS[latest.urgency] ?? 'Stable';
}

function deriveInsight(entries: HealthTimelineEntry[]): {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isPhysicianTip: boolean;
} {
  // Physician-authored tips take priority over AI-derived suggestions.
  const latest = entries[0];
  if (latest?.physicianHealthTips?.trim()) {
    return {
      text: latest.physicianHealthTips.trim(),
      icon: 'medical',
      color: '#0AADA2',
      isPhysicianTip: true,
    };
  }
  return { ..._deriveBaseInsight(entries), isPhysicianTip: false };
}

function _deriveBaseInsight(entries: HealthTimelineEntry[]): {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  if (entries.length === 0) {
    return {
      text: 'Drink 8+ glasses of water daily and eat a balanced diet to stay healthy.',
      icon: 'water-outline',
      color: '#0891b2',
    };
  }

  const latest = entries[0];

  const condition = latest.condition || latest.title || '';
  const cond = condition.toLowerCase();
  const isActive = latest.status !== 'Completed';
  const activeNote = isActive ? ' Follow up with your doctor if symptoms change.' : '';
  const prev = entries[1];
  const URGENCY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const latestRank = URGENCY_RANK[latest.urgency] ?? 0;
  const prevRank = prev ? (URGENCY_RANK[prev.urgency] ?? 0) : latestRank;

  // ── CRITICAL urgency ──────────────────────────────────────────────────────
  if (latest.urgency === 'CRITICAL') {
    return {
      text: `${condition}: seek emergency care now. Call emergency services immediately.`,
      icon: 'alert-circle',
      color: '#dc2626',
    };
  }

  // ── Condition-specific actionable tips ────────────────────────────────────
  if (cond.includes('malaria')) {
    return {
      text: `Finish your antimalarial course, sleep under a net, and stay hydrated.${activeNote}`,

      icon: 'thermometer-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('typhoid')) {
    return {
      text: `Eat soft foods, drink boiled water, and complete your antibiotics.${activeNote}`,

      icon: 'flask-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('hypertension') || cond.includes('blood pressure')) {
    return {
      text: `Limit salt, exercise daily, and take your medication at the same time each day.${activeNote}`,

      icon: 'heart-outline',
      color: '#dc2626',
    };
  }
  if (cond.includes('diabetes')) {
    return {
      text: `Check blood glucose daily, avoid sugary drinks, and walk after meals.${activeNote}`,

      icon: 'medkit-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('tuberculosis') || cond.includes('tb')) {
    return {
      text: `Never skip TB meds — stopping early causes resistance. Keep your room ventilated.${activeNote}`,

      icon: 'lungs-outline' as keyof typeof Ionicons.glyphMap,
      color: '#dc2626',
    };
  }
  if (cond.includes('hiv') || cond.includes('aids')) {
    return {
      text: `Take ARVs daily at the same time and keep all clinic appointments.${activeNote}`,

      icon: 'shield-checkmark-outline',
      color: '#7c3aed',
    };
  }
  if (cond.includes('sickle cell') || cond.includes('scd')) {
    return {
      text: `Stay hydrated, avoid the cold, and keep your pain relief within reach.${activeNote}`,

      icon: 'pulse',
      color: '#dc2626',
    };
  }
  if (cond.includes('peptic') || cond.includes('ulcer') || cond.includes('gastritis')) {
    return {
      text: `Eat small meals often, avoid NSAIDs and spicy foods, take antacids as prescribed.${activeNote}`,

      icon: 'nutrition-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('uti') || cond.includes('urinary')) {
    return {
      text: `Drink 2–3L of water daily and finish your full antibiotic course.${activeNote}`,

      icon: 'water-outline',
      color: '#0891b2',
    };
  }
  if (cond.includes('respiratory') || cond.includes('pneumonia') || cond.includes('bronchitis') || cond.includes('asthma')) {
    return {
      text: `Avoid smoke, use your inhaler as directed, and sleep with your head elevated.${activeNote}`,

      icon: 'medical-outline',
      color: '#0891b2',
    };
  }
  if (cond.includes('dengue')) {
    return {
      text: `Rest, drink fluids, use paracetamol only — report any bleeding immediately.${activeNote}`,

      icon: 'bug-outline' as keyof typeof Ionicons.glyphMap,
      color: '#d97706',
    };
  }
  if (cond.includes('anaemia') || cond.includes('anemia')) {
    return {
      text: `Eat iron-rich foods (beans, liver, greens) and take iron with vitamin C.${activeNote}`,

      icon: 'nutrition-outline',
      color: '#d97706',
    };
  }

  // ── Urgency / trend-based tips (fallback when no specific condition matched) ──
  if (latest.urgency === 'HIGH' && isActive) {
    return {
      text: `Rest, stay hydrated, and follow your physician's plan for ${condition}.`,
      icon: 'warning',
      color: '#dc2626',
    };
  }
  if (latestRank < prevRank && latest.status === 'Completed') {
    return {
      text: `Great progress on ${condition} — stay consistent with meds and get 7–8 hrs of sleep.`,
      icon: 'trending-up',
      color: '#16a34a',
    };
  }
  if (latestRank > prevRank) {
    return {
      text: `${condition} may be worsening — rest, increase fluids, and consult your physician.`,
      icon: 'pulse',
      color: '#d97706',
    };
  }
  if (latest.urgency === 'MEDIUM') {
    return {
      text: `Monitor ${condition} daily, stay hydrated, and see a doctor if symptoms worsen.`,
      icon: 'eye-outline',
      color: '#d97706',
    };
  }
  const allCompleted = entries.slice(0, 3).every((e) => e.status === 'Completed');
  if (allCompleted) {
    return {
      text: 'Great health streak! Keep exercising, eating well, and schedule your annual checkup.',
      icon: 'checkmark-circle',
      color: '#16a34a',
    };
  }
  return {
    text: `Stay consistent with your ${condition} treatment and attend regular checkups.`,
    icon: 'sparkles-outline',
    color: '#0891b2',
  };
}

/** Normalise a date string that may be in PostgreSQL ::text format
 *  e.g. "2026-04-28 09:15:23.123456+00" → "2026-04-28T09:15:23.123456+00:00"
 *  so that JavaScriptCore (React Native / Expo Go) can parse it reliably.
 */
function normalizeDate(raw: string): string {
  if (!raw) return '';
  return raw.trim()
    .replace(' ', 'T')                       // space → T separator
    .replace(/([+-]\d{2})$/, '$1:00');        // +00 → +00:00
}

function formatRelativeDate(raw: string): string {
  try {
    const d = new Date(normalizeDate(raw));
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const HealthStatusCard = React.memo<{
  status: HealthStatus;
  latest: HealthTimelineEntry | null;
  totalActive: number;
}>(function HealthStatusCard({
  status,
  latest,
  totalActive,
}) {
  const cfg = STATUS_CFG[status];
  return (
    <LinearGradient
      colors={[cfg.gradientFrom, cfg.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        marginHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: cfg.border,
        padding: 18,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: cfg.color + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: cfg.color,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Current Health Status
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: cfg.color, marginTop: 1 }}>
            {cfg.label}
          </Text>
        </View>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cfg.dot }} />
      </View>

      <View style={{ height: 1, backgroundColor: cfg.border, marginBottom: 12 }} />

      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              color: cfg.color + 'aa',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            Last Reported
          </Text>
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 3 }}
            numberOfLines={1}
          >
            {latest ? latest.condition || latest.title : '—'}
          </Text>
          {latest && (
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
              {formatRelativeDate(latest.createdAt)}
            </Text>
          )}
        </View>
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 16,
            borderLeftWidth: 1,
            borderLeftColor: cfg.border,
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: '800', color: cfg.color }}>{totalActive}</Text>
          <Text style={{ fontSize: 10, color: cfg.color + 'aa', fontWeight: '600' }}>Active</Text>
        </View>
      </View>
    </LinearGradient>
  );
});

const AIInsightCard = React.memo<{
  insight: { text: string; icon: keyof typeof Ionicons.glyphMap; color: string; isPhysicianTip: boolean };
}>(function AIInsightCard({
  insight,
}) {
  const label = insight.isPhysicianTip ? 'Physician Health Tip' : 'AI Health Insight';
  const labelColor = insight.isPhysicianTip ? '#0AADA2' : '#0891b2';
  return (
    <View
      style={{
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: insight.isPhysicianTip ? '#99f6e4' : '#e0f2fe',
        padding: 14,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: insight.color + '18',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <Ionicons name={insight.icon} size={18} color={insight.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: labelColor,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19 }}>{insight.text}</Text>
      </View>
    </View>
  );
});

const PROMOTIONS = [
  { title: 'Check-ins', subtitle: 'Log daily health check-ins & earn rewards', icon: 'checkmark-circle-outline' as const, color: '#0891b2', bg: '#e0f2fe' },
  { title: 'Explore', subtitle: 'Browse health tips, videos & articles', icon: 'compass-outline' as const, color: '#059669', bg: '#d1fae5' },
  { title: 'Referrals', subtitle: 'Invite friends and earn Diagnosis credits', icon: 'people-outline' as const, color: '#dc2626', bg: '#fee2e2' },
];

function PromotionsSection() {
  return (
    <View style={{ marginBottom: 16, paddingHorizontal: 16, gap: 10 }}>
      {PROMOTIONS.map((item) => (
        <Pressable
          key={item.title}
          onPress={() => {
            if (item.title === 'Check-ins') router.push('/(tab)/health/checkins' as never);
            if (item.title === 'Explore') router.push('/(tab)/health/explore' as never);
            if (item.title === 'Referrals') router.push('/(tab)/health/referrals' as never);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            opacity: pressed ? 0.82 : 1,
            backgroundColor: item.bg,
            borderRadius: 20,
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 16,
            shadowColor: item.color,
            shadowOpacity: 0.14,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          })}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: item.color,
              shadowOpacity: 0.18,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <Ionicons name={item.icon} size={24} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>{item.title}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={item.color} />
        </Pressable>
      ))}
    </View>
  );
}

function UnreadAlertsBanner({ unreadAlertCount }: { unreadAlertCount: number }) {
  return (
    <Pressable
      onPress={() => router.push('/(tab)/health/alerts' as never)}
      className="m-4"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#fef3c7',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#fde68a',
          padding: 12,
          gap: 10,
        }}
      >
        <Ionicons name="alert-circle" size={20} color="#b45309" />
        <Text style={{ flex: 1, fontSize: 13, color: '#92400e', fontWeight: '600' }}>
          {unreadAlertCount} unread alert{unreadAlertCount !== 1 ? 's' : ''} — tap to review
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#b45309" />
      </View>
    </Pressable>
  );
}

const RecentCaseRow = React.memo<{ entry: HealthTimelineEntry }>(function RecentCaseRow({ entry }) {
  const color = URGENCY_COLOR[entry.urgency] ?? '#6b7280';
  const bg = URGENCY_BG[entry.urgency] ?? '#f9fafb';
  const border = URGENCY_BORDER[entry.urgency] ?? '#e5e7eb';
  return (
    <Pressable
      onPress={() => router.push(`/(tab)/diagnosis/${entry.id}` as never)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: bg,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: border,
          padding: 12,
          marginBottom: 8,
          gap: 12,
        }}
      >
        <View
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, flexShrink: 0 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {entry.condition || entry.title}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {formatRelativeDate(entry.createdAt)}
            {entry.status ? `  ·  ${entry.status}` : ''}
          </Text>
        </View>
        {entry.confidence > 0 && (
          <Text style={{ fontSize: 11, fontWeight: '600', color }}>{entry.confidence}%</Text>
        )}
        <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
      </View>
    </Pressable>
  );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HealthDashboardScreen() {
  const {
    patientTimeline,
    timelineLoading,
    alertsLoading,
    unreadAlertCount,
    fetchPatientTimeline,
    fetchPatientAlerts,
    reset: resetHealthStore,
  } = useHealthStore();

  const { user, sessionLoading } = useAuthStore();

  // Track the last userId that triggered a fetch. When a different user
  // becomes active, drop stale data immediately so the previous user's
  // records never flash in the new user's view.
  const fetchedForUserId = useRef<string | null>(null);

  // Wait for the session to be fully restored before making authenticated API
  // calls. On a web refresh, _layout.tsx triggers restoreSession() which is
  // async. Without this guard, the API calls fire before the access token is
  // set in memory, causing a 401 / stuck loading state.
  useEffect(() => {
    if (!sessionLoading && user?.id) {
      if (fetchedForUserId.current !== user.id) {
        // User changed — clear stale data before the new fetch resolves.
        resetHealthStore();
      }
      fetchedForUserId.current = user.id;
      fetchPatientTimeline();
      fetchPatientAlerts();
    }
    if (!user?.id) {
      fetchedForUserId.current = null;
    }
  }, [sessionLoading, user?.id]);

  // Silently re-fetch whenever the patient navigates back to this tab so
  // physician edits (condition, urgency, notes) appear without a manual
  // pull-to-refresh. Only runs after the initial auth-gated load above has
  // already completed (fetchedForUserId.current is set), which avoids a
  // redundant double-fetch on first mount.
  // Skipped when data is less than 60 seconds old to prevent rapid tab-switch storms.
  const lastTimelineFetchAt = useHealthStore((s) => s.lastTimelineFetchAt);
  const lastAlertsFetchAt = useHealthStore((s) => s.lastAlertsFetchAt);
  const STALE_MS = 60_000;
  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading && user?.id && fetchedForUserId.current === user.id) {
        const now = Date.now();
        if (!lastTimelineFetchAt || now - lastTimelineFetchAt >= STALE_MS) {
          fetchPatientTimeline();
        }
        if (!lastAlertsFetchAt || now - lastAlertsFetchAt >= STALE_MS) {
          fetchPatientAlerts();
        }
      }
    }, [sessionLoading, user?.id, fetchPatientTimeline, fetchPatientAlerts, lastTimelineFetchAt, lastAlertsFetchAt]),
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPatientTimeline(), fetchPatientAlerts()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPatientTimeline, fetchPatientAlerts]);

  const isLoading = timelineLoading && patientTimeline.length === 0;
  const status = useMemo(() => deriveStatus(patientTimeline), [patientTimeline]);
  const insight = useMemo(() => deriveInsight(patientTimeline), [patientTimeline]);

  // Schedule the daily 8 AM health insight notification only when the insight
  // text actually changes — avoids re-scheduling on every WebSocket patch.
  const lastScheduledInsight = useRef<string>('');
  useEffect(() => {
    if (!timelineLoading && insight.text !== lastScheduledInsight.current) {
      lastScheduledInsight.current = insight.text;
      scheduleHealthInsightNotification(insight.text);
    }
  }, [insight.text, timelineLoading]);

  const latest = patientTimeline[0] ?? null;
  const totalActive = useMemo(
    () => patientTimeline.filter((e) => e.status !== 'Completed').length,
    [patientTimeline]
  );
  const recentCases = useMemo(() => patientTimeline.slice(0, 3), [patientTimeline]);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  // ── FAB pulse animation ────────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const fabPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(fabPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, [fabPulse]);
  const fabRingScale = fabPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.0] });
  const fabRingOpacity = fabPulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.55, 0.2, 0] });

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      {/* ── Header (chatscreen style) ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(99,210,194,0.25)',
        }}
      >
        {/* Left: LifeGate logo */}
        <TouchableOpacity
          onPress={() => router.replace('/(tab)/health' as never)}
          activeOpacity={0.7}
          style={{ padding: 4 }}
        >
          <Logo width={32} height={32} />
        </TouchableOpacity>

        {/* Center: Brand */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: '#0f766e',
              letterSpacing: -0.5,
            }}
          >
            Life<Text style={{ color: '#0AADA2' }}>Gate</Text>
          </Text>
        </View>

        {/* Right: Notification icon */}
        <TouchableOpacity
          onPress={() => router.push('/(tab)/health/alerts' as never)}
          activeOpacity={0.7}
          style={{ padding: 6, position: 'relative' }}
        >
          <Ionicons name="notifications-outline" size={24} color="#0f766e" />
          {unreadAlertCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#dc2626',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 3,
              }}
            >
              <Text style={{ fontSize: 9, color: '#fff', fontWeight: '800' }}>
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Loading ── */}
      <ScrollView
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 160 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0AADA2"
            colors={['#0AADA2']}
            progressBackgroundColor="#ffffff"
          />
        }
      >
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color="#0AADA2" />
            <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
              Loading your health data…
            </Text>
          </View>
        ) : (
          <View>
          {/* Greeting card — colours follow current health status */}
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <GreetingSection
              userName={user?.name || ''}
              gradientColors={GREETING_GRADIENT[status] ?? GREETING_GRADIENT.default}
              statusLabel={STATUS_CFG[status].label}
              statusIcon={GREETING_STATUS_ICON[status]}
              lastReportedCase={latest ? (latest.condition || latest.title) : undefined}
              lastReportedDate={latest ? formatRelativeDate(latest.createdAt) : undefined}
              activeCases={totalActive}
              insightText={
                latest?.physicianHealthTips?.trim()
                  ? latest.physicianHealthTips.trim()
                  : 'Your physician\'s personalised health tips will appear here once your case is reviewed.'
              }
            />
          </View>

          <PromotionsSection />

          {/* Recent Cases */}
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#f3f4f6',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f3f4f6',
                backgroundColor: '#fafafa',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="medical-outline" size={16} color="#0AADA2" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                  Recent Cases
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/(tab)/health/timeline' as never)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#0AADA2' }}>See All</Text>
                <Ionicons name="chevron-forward" size={13} color="#0AADA2" />
              </Pressable>
            </View>

            <View style={{ padding: 12 }}>
              {recentCases.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="clipboard-outline" size={32} color="#d1d5db" />
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: '#9ca3af',
                      textAlign: 'center',
                    }}
                  >
                    No cases yet. Start a consultation to begin tracking your health.
                  </Text>
                  <Pressable
                    onPress={() => router.push('/(tab)/chatScreen' as never)}
                    style={{
                      marginTop: 14,
                      backgroundColor: '#0AADA2',
                      paddingHorizontal: 22,
                      paddingVertical: 9,
                      borderRadius: 20,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      Start Consultation
                    </Text>
                  </Pressable>
                </View>
              ) : (
                recentCases.map((entry) => <RecentCaseRow key={entry.id} entry={entry} />)
              )}
            </View>
          </View>

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    <PatientBottomTabBar activeTab="health" />

      {/* ── AI Chat FAB ── */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          bottom: insets.bottom + 82,
          right: 20,
          alignItems: 'center',
          justifyContent: 'center',
          width: 60,
          height: 60,
        }}
      >
        {/* Expanding pulse ring */}
        <Animated.View
          style={{
            position: 'absolute',
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#0AADA2',
            transform: [{ scale: fabRingScale }],
            opacity: fabRingOpacity,
          }}
        />
        {/* Second ring for depth */}
        <Animated.View
          style={{
            position: 'absolute',
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#0AADA2',
            transform: [{ scale: fabPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            opacity: fabPulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 0.15, 0] }),
          }}
        />
        {/* FAB button */}
        <TouchableOpacity
          onPress={() => router.push('/(tab)/chatScreen' as never)}
          activeOpacity={0.85}
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#0AADA2',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0AADA2',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.45,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <Ionicons name="pulse" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
    </>
  );
}
