import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHealthStore } from 'stores/health-store';
import { useAuthStore } from 'stores/auth/auth-store';
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
  activeTip?: string;
} {
  if (entries.length === 0) {
    return {
      text: 'Drink at least 8 glasses of water daily and maintain a balanced diet to support your immune system.',
      icon: 'water-outline',
      color: '#0891b2',
    };
  }

  const latest = entries[0];
  const condition = latest.condition || latest.title || '';
  const cond = condition.toLowerCase();
  const prev = entries[1];
  const URGENCY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const latestRank = URGENCY_RANK[latest.urgency] ?? 0;
  const prevRank = prev ? (URGENCY_RANK[prev.urgency] ?? 0) : latestRank;

  // ── CRITICAL urgency ──────────────────────────────────────────────────────
  if (latest.urgency === 'CRITICAL') {
    return {
      text: `With ${condition}, call emergency services or go to A&E immediately. Do not wait for symptoms to worsen.`,
      icon: 'alert-circle',
      color: '#dc2626',
    };
  }

  // ── Condition-specific actionable tips ────────────────────────────────────
  if (cond.includes('malaria')) {
    return {
      text: `For ${condition}: complete your full antimalarial course, sleep under treated nets, and stay well-hydrated with ORS or fluids.`,
      icon: 'thermometer-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('typhoid')) {
    return {
      text: `For ${condition}: eat soft, easy-to-digest foods, drink only boiled or bottled water, and complete your antibiotic course without interruption.`,
      icon: 'flask-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('hypertension') || cond.includes('blood pressure')) {
    return {
      text: `For ${condition}: reduce salt and processed foods, exercise 30 minutes daily, avoid stress, and take your medication at the same time every day.`,
      icon: 'heart-outline',
      color: '#dc2626',
    };
  }
  if (cond.includes('diabetes')) {
    return {
      text: `For ${condition}: monitor your blood glucose daily, avoid sugary drinks, eat at regular intervals, and do light exercise such as walking after meals.`,
      icon: 'medkit-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('tuberculosis') || cond.includes('tb')) {
    return {
      text: `For ${condition}: take all TB medications daily without skipping — stopping early causes drug resistance. Ventilate your room and wear a mask around others.`,
      icon: 'lungs-outline' as keyof typeof Ionicons.glyphMap,
      color: '#dc2626',
    };
  }
  if (cond.includes('hiv') || cond.includes('aids')) {
    return {
      text: `For ${condition}: take your ARV medication daily at the same time, attend all clinic appointments, and maintain a protein-rich diet to support your immune system.`,
      icon: 'shield-checkmark-outline',
      color: '#7c3aed',
    };
  }
  if (cond.includes('sickle cell') || cond.includes('scd')) {
    return {
      text: `For ${condition}: stay hydrated, avoid cold temperatures, rest well during crises, and keep hydroxyurea and pain relief medications accessible.`,
      icon: 'pulse',
      color: '#dc2626',
    };
  }
  if (cond.includes('peptic') || cond.includes('ulcer') || cond.includes('gastritis')) {
    return {
      text: `For ${condition}: eat small frequent meals, avoid NSAIDs, spicy foods, alcohol, and coffee. Take antacids or proton pump inhibitors as prescribed.`,
      icon: 'nutrition-outline',
      color: '#d97706',
    };
  }
  if (cond.includes('uti') || cond.includes('urinary')) {
    return {
      text: `For ${condition}: drink 2–3 litres of water daily, urinate frequently, and complete your full antibiotic course to prevent recurrence.`,
      icon: 'water-outline',
      color: '#0891b2',
    };
  }
  if (cond.includes('respiratory') || cond.includes('pneumonia') || cond.includes('bronchitis') || cond.includes('asthma')) {
    return {
      text: `For ${condition}: avoid dust and smoke, use your inhaler or prescribed medication as directed, rest well, and sleep with your head slightly elevated.`,
      icon: 'medical-outline',
      color: '#0891b2',
    };
  }
  if (cond.includes('dengue')) {
    return {
      text: `For ${condition}: rest, drink plenty of fluids, use paracetamol for fever — avoid ibuprofen or aspirin. Report any bleeding or severe vomiting immediately.`,
      icon: 'bug-outline' as keyof typeof Ionicons.glyphMap,
      color: '#d97706',
    };
  }
  if (cond.includes('anaemia') || cond.includes('anemia')) {
    return {
      text: `For ${condition}: eat iron-rich foods (beans, liver, leafy greens), take iron supplements with vitamin C for better absorption, and avoid tea with meals.`,
      icon: 'nutrition-outline',
      color: '#d97706',
    };
  }

  // ── Urgency / trend-based tips (fallback when no specific condition matched) ──
  if (latest.urgency === 'HIGH' && latest.status === 'Active') {
    return {
      text: `Rest, stay hydrated, and follow your physician's instructions for ${condition}. Avoid self-medicating and report any new symptoms immediately.`,
      icon: 'warning',
      color: '#dc2626',
    };
  }
  if (latestRank < prevRank && latest.status === 'Completed') {
    return {
      text: `Great progress recovering from ${condition}! Maintain your medication schedule, eat nutritiously, and get at least 7–8 hours of sleep.`,
      icon: 'trending-up',
      color: '#16a34a',
    };
  }
  if (latestRank > prevRank) {
    return {
      text: `Your ${condition} symptoms appear to be escalating. Increase fluid intake, rest, and consult your physician if fever or pain worsens.`,
      icon: 'pulse',
      color: '#d97706',
    };
  }
  if (latest.urgency === 'MEDIUM') {
    return {
      text: `For ${condition}: monitor your temperature and symptoms twice daily. Stay hydrated, eat light, and chat with LifeGate if anything changes.`,
      icon: 'eye-outline',
      color: '#d97706',
    };
  }
  const allCompleted = entries.slice(0, 3).every((e) => e.status === 'Completed');
  if (allCompleted) {
    return {
      text: 'You are on a great health streak! Exercise regularly, eat a balanced diet, and keep your annual checkups to stay ahead of any issues.',
      icon: 'checkmark-circle',
      color: '#16a34a',
    };
  }
  return {
    text: `Stay consistent with your treatment for ${condition}. Regular check-ins with LifeGate help catch changes early.`,
    icon: 'sparkles-outline',
    color: '#0891b2',
  };
}

// Returns a one-line active-case tip for the highest-urgency pending case.
function deriveActiveCaseTip(entries: HealthTimelineEntry[]): string | undefined {
  const active = entries.filter((e) => e.status !== 'Completed');
  if (active.length === 0) return undefined;
  const RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const top = active.sort((a, b) => (RANK[b.urgency] ?? 0) - (RANK[a.urgency] ?? 0))[0];
  const name = top.condition || top.title || 'your condition';
  if (top.urgency === 'CRITICAL') return `⚠ Active: ${name} — seek emergency care now.`;
  if (top.urgency === 'HIGH') return `🔴 Active: ${name} — prioritise rest, fluids, and your prescribed medication today.`;
  if (top.urgency === 'MEDIUM') return `🟡 Active: ${name} — monitor symptoms twice daily and update LifeGate if they worsen.`;
  return `🟢 Active: ${name} — maintain your routine and complete the full treatment course.`;
}

function formatRelativeDate(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthStatusCard({
  status,
  latest,
  totalActive,
}: {
  status: HealthStatus;
  latest: HealthTimelineEntry | null;
  totalActive: number;
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
}

function AIInsightCard({
  insight,
}: {
  insight: { text: string; icon: keyof typeof Ionicons.glyphMap; color: string; activeTip?: string };
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e0f2fe',
        padding: 14,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
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
            color: '#0891b2',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}
        >
          AI Health Insight
        </Text>
        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19 }}>{insight.text}</Text>
        {insight.activeTip ? (
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#e0f2fe',
            }}
          >
            <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18, fontWeight: '500' }}>
              {insight.activeTip}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function QuickActions() {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Quick Actions
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => router.push('/(tab)/chatScreen' as never)}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.82 : 1 })}
        >
          <LinearGradient
            colors={['#0AADA2', '#0d7c74']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 14, alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="fitness-outline" size={20} color="#fff" />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' }}>
              Report Symptoms
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
              Chat with AI for analysis
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(tab)/chatScreen' as never)}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.82 : 1 })}
        >
          <LinearGradient
            colors={['#0f766e', '#134e4a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 14, alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' }}>
              Chat with LifeGate
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
              AI + Physician support
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function RecentCaseRow({ entry }: { entry: HealthTimelineEntry }) {
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
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HealthDashboardScreen() {
  const {
    patientTimeline,
    timelineLoading,
    alertsLoading,
    unreadAlertCount,
    fetchPatientTimeline,
    fetchPatientAlerts,
  } = useHealthStore();

  const { user } = useAuthStore();

  useEffect(() => {
    fetchPatientTimeline();
    fetchPatientAlerts();
  }, []);

  const onRefresh = useCallback(async () => {
    await Promise.all([fetchPatientTimeline(), fetchPatientAlerts()]);
  }, [fetchPatientTimeline, fetchPatientAlerts]);

  const isLoading = timelineLoading && patientTimeline.length === 0;
  const status = useMemo(() => deriveStatus(patientTimeline), [patientTimeline]);
  const activeCaseTip = useMemo(() => deriveActiveCaseTip(patientTimeline), [patientTimeline]);
  const insight = useMemo(
    () => ({ ...deriveInsight(patientTimeline), activeTip: activeCaseTip }),
    [patientTimeline, activeCaseTip]
  );
  const latest = patientTimeline[0] ?? null;
  const totalActive = useMemo(
    () => patientTimeline.filter((e) => e.status !== 'Completed').length,
    [patientTimeline]
  );
  const recentCases = useMemo(() => patientTimeline.slice(0, 4), [patientTimeline]);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
            Dashboard
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
            Good {getTimeOfDay()}, {firstName}
          </Text>
        </View>

        {/* Alerts */}
        <Pressable
          onPress={() => router.push('/(tab)/health/alerts' as never)}
          style={{ padding: 8, borderRadius: 20, backgroundColor: '#f3f4f6', position: 'relative' }}
          hitSlop={8}
        >
          <Ionicons name="notifications-outline" size={22} color="#374151" />
          {unreadAlertCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
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
        </Pressable>

        {/* Full history */}
        <Pressable
          onPress={() => router.push('/(tab)/health/timeline' as never)}
          style={{ padding: 8, borderRadius: 20, backgroundColor: '#f3f4f6', marginLeft: 8 }}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={22} color="#374151" />
        </Pressable>

        {/* Settings */}
        <Pressable
          onPress={() => router.push('/(tab)/settings' as never)}
          style={{ padding: 8, borderRadius: 20, backgroundColor: '#f3f4f6', marginLeft: 8 }}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color="#374151" />
        </Pressable>
      </View>

      {/* ── Loading ── */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
            Loading your health data…
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={timelineLoading || alertsLoading}
              onRefresh={onRefresh}
              tintColor="#0AADA2"
            />
          }
        >
          {/* Unread alerts banner */}
          {unreadAlertCount > 0 && (
            <Pressable
              onPress={() => router.push('/(tab)/health/alerts' as never)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                marginHorizontal: 16,
                marginBottom: 12,
              })}
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
          )}

          <HealthStatusCard status={status} latest={latest} totalActive={totalActive} />
          <AIInsightCard insight={insight} />
          <QuickActions />

          {/* Recent Cases */}
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#f3f4f6',
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 2,
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

          {/* Stats strip */}
          {patientTimeline.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-around',
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: '#f3f4f6',
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              {[
                { label: 'Total', value: patientTimeline.length, color: '#0891b2' },
                { label: 'Active', value: totalActive, color: '#d97706' },
                {
                  label: 'Resolved',
                  value: patientTimeline.filter((e) => e.status === 'Completed').length,
                  color: '#16a34a',
                },
              ].map((stat) => (
                <View key={stat.label} style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: stat.color }}>
                    {stat.value}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500' }}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
