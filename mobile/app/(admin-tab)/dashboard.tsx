/**
 * Admin Monitoring Dashboard
 *
 * Panels:
 *  1. Live Stats Bar      — active users, total cases, physicians available
 *  2. Case Counts         — Pending / Active / Completed / Escalated today
 *  3. SLA Tracker         — time-in-queue per Pending case, colour-coded
 *  4. EDIS Metrics        — escalation rate, confidence avg, flag frequency
 *  5. Physician Panel     — list with active-case load and availability badge
 *  6. Case Management     — searchable/filterable case list
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdminStore } from '../../stores/admin-store';
import { useAuthStore } from '../../stores/auth-store';
import type { AdminCaseRow, SLAItem, FlagCount, PhysicianRow, SLABreachAlert, AuditEvent, AdminTransactionRow, NDPASnapshot } from '../../types/admin-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) { return `${n.toFixed(1)}%`; }
function round1(n: number) { return n.toFixed(1); }

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
};

const SLA_BG: Record<string, string>   = { green: '#dcfce7', yellow: '#fef9c3', red: '#fee2e2' };
const SLA_TEXT: Record<string, string> = { green: '#166534', yellow: '#854d0e', red: '#991b1b' };
const SLA_DOT: Record<string, string>  = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Pending:   { bg: '#f3e8ff', text: '#7e22ce' },
  Active:    { bg: '#dbeafe', text: '#1d4ed8' },
  Completed: { bg: '#dcfce7', text: '#166534' },
};

// ─── Micro-components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <View className="flex-1 mx-1 bg-white rounded-2xl p-3 items-center"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
      <View className="w-9 h-9 rounded-full items-center justify-center mb-1.5"
        style={{ backgroundColor: color + '20' }}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text className="text-lg font-bold text-gray-900">{value}</Text>
      <Text className="text-[10px] text-gray-500 text-center mt-0.5">{label}</Text>
    </View>
  );
}

function SectionHeader({ title, icon, accent }: { title: string; icon: string; accent: string }) {
  return (
    <View className="flex-row items-center mb-3 mt-5">
      <View className="w-7 h-7 rounded-lg items-center justify-center mr-2" style={{ backgroundColor: accent + '18' }}>
        <Ionicons name={icon as any} size={15} color={accent} />
      </View>
      <Text className="text-base font-bold text-gray-800">{title}</Text>
    </View>
  );
}

// ─── SLA Row ─────────────────────────────────────────────────────────────────

function SLARow({ item }: { item: SLAItem }) {
  const color = item.slaColor as 'green' | 'yellow' | 'red';
  return (
    <View className="flex-row items-center py-2.5 border-b border-gray-50">
      <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: SLA_DOT[color] }} />
      <View className="flex-1">
        <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>{item.title || 'Untitled'}</Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          <Text style={{ color: URGENCY_COLORS[item.urgency] || '#6b7280' }}>{item.urgency}</Text>
          {'  ·  '}in queue {item.waitFormatted}
        </Text>
      </View>
      <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: SLA_BG[color] }}>
        <Text className="text-[11px] font-semibold" style={{ color: SLA_TEXT[color] }}>
          {color.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// ─── EDIS Metric Row ──────────────────────────────────────────────────────────

function FlagBar({ flag, count, max }: { flag: string; count: number; max: number }) {
  const ratio = max > 0 ? count / max : 0;
  return (
    <View className="mb-2">
      <View className="flex-row justify-between mb-0.5">
        <Text className="text-xs text-gray-600">{flag.replace(/_/g, ' ')}</Text>
        <Text className="text-xs font-semibold text-gray-800">{count}</Text>
      </View>
      <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <View className="h-full rounded-full bg-teal-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </View>
    </View>
  );
}

// ─── Physician Row ────────────────────────────────────────────────────────────

function PhysicianCard({ p, onPress }: { p: PhysicianRow; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      className="flex-row items-center py-2.5 border-b border-gray-50">
      <View className="w-9 h-9 rounded-full bg-teal-50 items-center justify-center mr-3">
        {p.flagged
          ? <Ionicons name="flag" size={14} color="#dc2626" />
          : <Ionicons name="person" size={16} color="#0AADA2" />}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-sm font-semibold text-gray-800">{p.name}</Text>
          {p.accountStatus === 'suspended' && (
            <View className="ml-2 px-1.5 py-0.5 rounded bg-red-100">
              <Text className="text-[9px] font-bold text-red-700">SUSP</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-400">{p.specialization || 'General'}</Text>
      </View>
      <View className="items-end gap-1">
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: p.available ? '#22c55e' : '#f97316' }} />
          <Text className="text-xs text-gray-500">{p.available ? 'Available' : `${p.activeCases} active`}</Text>
        </View>
        {p.slaBreachCountWeek >= 3 && (
          <Text className="text-[10px] font-semibold text-red-500">{p.slaBreachCountWeek} breaches (7d)</Text>
        )}
        <Text className="text-[11px] text-gray-400">{p.totalCompleted} completed</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Case Row ─────────────────────────────────────────────────────────────────

function CaseRow({ item }: { item: AdminCaseRow }) {
  const statusStyle = STATUS_COLORS[item.status] ?? STATUS_COLORS.Pending;
  const urgColor = URGENCY_COLORS[item.urgency] ?? '#6b7280';
  return (
    <View className="bg-white rounded-xl p-3 mb-2"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-sm font-semibold text-gray-800 flex-1 pr-2" numberOfLines={1}>
          {item.title || item.condition || 'Untitled'}
        </Text>
        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: statusStyle.bg }}>
          <Text className="text-[11px] font-semibold" style={{ color: statusStyle.text }}>{item.status}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-xs text-gray-400">{item.patientName}</Text>
        {item.escalated && (
          <View className="flex-row items-center">
            <Ionicons name="arrow-up-circle" size={11} color="#f97316" />
            <Text className="text-[10px] text-orange-500 ml-0.5">Escalated</Text>
          </View>
        )}
        <Text className="text-[11px] font-semibold ml-auto" style={{ color: urgColor }}>{item.urgency}</Text>
        {item.confidence > 0 && (
          <Text className="text-[10px] text-gray-400">{item.confidence}% conf.</Text>
        )}
      </View>
      {item.physicianName ? (
        <Text className="text-[10px] text-gray-400 mt-0.5">Dr. {item.physicianName}</Text>
      ) : null}
    </View>
  );
}

// ─── SLA Breach Alert Row ─────────────────────────────────────────────────────

function BreachAlertRow({ item }: { item: SLABreachAlert }) {
  const urgColor = URGENCY_COLORS[item.urgency] ?? '#6b7280';
  return (
    <View className="py-3 border-b border-gray-50">
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
            {item.caseTitle || 'Untitled Case'}
          </Text>
          <Text className="text-[11px] font-bold mt-0.5" style={{ color: urgColor }}>
            {item.urgency}
          </Text>
        </View>
        <View className="items-end">
          <View className="flex-row items-center bg-red-50 px-2 py-0.5 rounded-full">
            <Ionicons name="warning" size={10} color="#dc2626" />
            <Text className="text-[10px] font-bold text-red-700 ml-0.5">BREACH</Text>
          </View>
          <Text className="text-[10px] text-gray-400 mt-1">{item.waitFormatted} overdue</Text>
        </View>
      </View>
      <View className="flex-row items-center mt-1 gap-3">
        {item.originalPhysicianName ? (
          <View className="flex-row items-center">
            <Ionicons name="person-remove-outline" size={11} color="#9ca3af" />
            <Text className="text-[11px] text-gray-400 ml-1">From: Dr. {item.originalPhysicianName}</Text>
          </View>
        ) : null}
        {item.newPhysicianName ? (
          <View className="flex-row items-center">
            <Ionicons name="person-add-outline" size={11} color="#0AADA2" />
            <Text className="text-[11px] text-teal-700 ml-1">To: Dr. {item.newPhysicianName}</Text>
          </View>
        ) : (
          <View className="flex-row items-center">
            <Ionicons name="alert-circle-outline" size={11} color="#f97316" />
            <Text className="text-[11px] text-orange-600 ml-1">No physician available</Text>
          </View>
        )}
        {item.natsPublished && (
          <View className="flex-row items-center ml-auto">
            <Ionicons name="radio" size={10} color="#22c55e" />
            <Text className="text-[10px] text-green-600 ml-0.5">NATS</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Reassignment Log Row ─────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  'case.status_change': '#6366f1',
  'case.reviewed':      '#0AADA2',
  'case.escalated':     '#f97316',
  'admin.action':       '#8b5cf6',
  'auth.login':         '#22c55e',
  'auth.logout':        '#64748b',
};

function AuditEventRow({ item }: { item: AuditEvent }) {
  const color = EVENT_TYPE_COLORS[item.eventType] ?? '#6b7280';
  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <View className="py-3 border-b border-gray-50">
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center">
            <View className="px-2 py-0.5 rounded mr-2" style={{ backgroundColor: color + '18' }}>
              <Text className="text-[10px] font-bold" style={{ color }}>{item.eventType}</Text>
            </View>
            <Text className="text-[11px] text-gray-400">{dateStr}</Text>
          </View>
          <Text className="text-sm font-medium text-gray-800 mt-0.5" numberOfLines={1}>
            {item.actorName || item.actorId}
          </Text>
        </View>
        <View className="bg-gray-100 px-2 py-0.5 rounded">
          <Text className="text-[10px] text-gray-500 font-medium">{item.actorRole}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text className="text-[11px] text-gray-500">
          <Text className="text-gray-400">Resource: </Text>{item.resource}/{item.resourceId}
        </Text>
        {item.ipAddress ? (
          <Text className="text-[10px] text-gray-400">IP: {item.ipAddress}</Text>
        ) : null}
      </View>
    </View>
  );
}

const TX_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: '#dcfce7', text: '#166534' },
  pending: { bg: '#fef9c3', text: '#854d0e' },
  failed:  { bg: '#fee2e2', text: '#991b1b' },
};

function TransactionRow({ item }: { item: AdminTransactionRow }) {
  const style = TX_STATUS_COLORS[item.status] ?? { bg: '#f1f5f9', text: '#475569' };
  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  return (
    <View className="py-3 border-b border-gray-50">
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
            {item.patientName || item.patientEmail || item.userId}
          </Text>
          <Text className="text-[11px] text-gray-400 mt-0.5">{item.patientEmail}</Text>
        </View>
        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg }}>
          <Text className="text-[10px] font-semibold" style={{ color: style.text }}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-3 flex-wrap">
        <Text className="text-sm font-bold text-gray-800">₦{item.amount.toLocaleString('en-NG')}</Text>
        {item.creditsGranted > 0 && (
          <Text className="text-[11px] text-teal-700">{item.creditsGranted} credits</Text>
        )}
        <Text className="text-[10px] text-gray-400 ml-auto">{dateStr}</Text>
      </View>
    </View>
  );
}

function NDPAMetricRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-teal-700">{label}</Text>
      <View className="flex-row items-center">
        <Text className="text-sm font-semibold text-teal-900 mr-1.5">{value}</Text>
        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={14} color={ok ? '#16a34a' : '#dc2626'} />
      </View>
    </View>
  );
}

function ReassignmentRow({ item, index }: { item: SLABreachAlert; index: number }) {
  const urgColor = URGENCY_COLORS[item.urgency] ?? '#6b7280';
  const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';
  return (
    <View className="py-3 border-b border-gray-50 flex-row">
      <View className="w-6 h-6 rounded-full bg-indigo-50 items-center justify-center mr-3 mt-0.5">
        <Text className="text-[10px] font-bold text-indigo-600">{index + 1}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
          {item.caseTitle || 'Untitled Case'}
        </Text>
        <View className="flex-row items-center mt-0.5 gap-3 flex-wrap">
          <Text className="text-[11px] font-semibold" style={{ color: urgColor }}>{item.urgency}</Text>
          <Text className="text-[11px] text-gray-400">Wait: {item.waitFormatted}</Text>
        </View>
        <View className="flex-row items-center mt-1 gap-2">
          {item.originalPhysicianName ? (
            <Text className="text-[11px] text-gray-500">
              <Text className="text-gray-400">From </Text>Dr. {item.originalPhysicianName}
            </Text>
          ) : (
            <Text className="text-[11px] text-gray-400">Unassigned</Text>
          )}
          <Ionicons name="arrow-forward" size={10} color="#6b7280" />
          <Text className="text-[11px] text-teal-700 font-medium">Dr. {item.newPhysicianName}</Text>
        </View>
        <Text className="text-[10px] text-gray-400 mt-1">{dateStr}</Text>
      </View>
    </View>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
const STATUS_TABS = ['', 'Pending', 'Active', 'Completed'];
const URGENCY_TABS = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function FilterBar({
  statusFilter,
  urgencyFilter,
  search,
  onStatus,
  onUrgency,
  onSearch,
}: {
  statusFilter: string;
  urgencyFilter: string;
  search: string;
  onStatus: (s: string) => void;
  onUrgency: (u: string) => void;
  onSearch: (s: string) => void;
}) {
  return (
    <View className="mb-3">
      {/* Search */}
      <View className="flex-row items-center bg-white rounded-xl px-3 py-2 mb-2"
        style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
        <Ionicons name="search" size={15} color="#9ca3af" />
        <TextInput
          className="flex-1 ml-2 text-sm text-gray-800"
          placeholder="Search cases, patients, conditions…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={onSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => onSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1.5">
        {STATUS_TABS.map((s) => (
          <TouchableOpacity
            key={s || 'all-status'}
            onPress={() => onStatus(s)}
            className="mr-2 px-3 py-1 rounded-full"
            style={{ backgroundColor: statusFilter === s ? '#0AADA2' : '#f1f5f9' }}>
            <Text className="text-xs font-medium" style={{ color: statusFilter === s ? '#fff' : '#64748b' }}>
              {s || 'All Status'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Urgency filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {URGENCY_TABS.map((u) => (
          <TouchableOpacity
            key={u || 'all-urgency'}
            onPress={() => onUrgency(u)}
            className="mr-2 px-3 py-1 rounded-full"
            style={{ backgroundColor: urgencyFilter === u ? (URGENCY_COLORS[u] ?? '#0AADA2') : '#f1f5f9' }}>
            <Text className="text-xs font-medium" style={{ color: urgencyFilter === u ? '#fff' : '#64748b' }}>
              {u || 'All Urgency'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type Panel = 'overview' | 'sla' | 'edis' | 'physicians' | 'cases' | 'breaches' | 'reassignments' | 'audit' | 'transactions' | 'compliance' | 'analytics';

const PANELS: { key: Panel; label: string; icon: string }[] = [
  { key: 'overview',       label: 'Overview',    icon: 'grid'            },
  { key: 'sla',            label: 'SLA',         icon: 'timer'           },
  { key: 'breaches',       label: 'Breaches',    icon: 'warning'         },
  { key: 'reassignments',  label: 'Reassigned',  icon: 'swap-horizontal' },
  { key: 'edis',           label: 'EDIS',        icon: 'analytics'       },
  { key: 'physicians',     label: 'Physicians',  icon: 'people'          },
  { key: 'cases',          label: 'Cases',       icon: 'folder-open'     },
  { key: 'audit',          label: 'Audit',       icon: 'document-text'   },
  { key: 'transactions',   label: 'Payments',    icon: 'card'            },
  { key: 'compliance',     label: 'Compliance',  icon: 'shield-checkmark'},
  { key: 'analytics',      label: 'Analytics',   icon: 'bar-chart'       },
];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const {
    dashboard, cases, casesTotal, slaItems, edisMetrics, physicians,
    slaBreachAlerts, reassignmentLog, reassignmentLogTotal,
    breachAlertsLoading, reassignmentLogLoading,
    auditEvents, auditTotal, auditLoading,
    transactions, transactionsTotal, transactionsLoading,
    ndpaSnapshots, complianceLoading,
    analyticsData, analyticsLoading, fetchAnalytics,
    loading, error,
    fetchAll, fetchCases, fetchSLABreachAlerts, fetchReassignmentLog,
    fetchAuditLog, fetchAllTransactions, fetchNDPASnapshots, generateNDPASnapshot,
    triggerExploreRefresh,
    setFilters, filters, clearError,
  } = useAdminStore();

  const [activePanel, setActivePanel] = useState<Panel>('overview');
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // Reload breach alerts when switching to the breaches or reassignments panel.
  useEffect(() => {
    if (activePanel === 'breaches') {
      fetchSLABreachAlerts();
    } else if (activePanel === 'reassignments') {
      fetchReassignmentLog();
    } else if (activePanel === 'audit') {
      fetchAuditLog();
    } else if (activePanel === 'transactions') {
      fetchAllTransactions();
    } else if (activePanel === 'compliance') {
      fetchNDPASnapshots();
    } else if (activePanel === 'analytics') {
      fetchAnalytics(analyticsDays);
    }
  }, [activePanel, analyticsDays, fetchSLABreachAlerts, fetchReassignmentLog, fetchAuditLog, fetchAllTransactions, fetchNDPASnapshots, fetchAnalytics]);

  const applyFilters = useCallback((extra?: { status?: string; urgency?: string; search?: string }) => {
    fetchCases({ status: statusFilter, urgency: urgencyFilter, search, page: 1, ...extra });
  }, [fetchCases, statusFilter, urgencyFilter, search]);

  // Reliable logout: clear auth state synchronously first so layout guards
  // don't redirect back to admin, then navigate, then let full async cleanup run.
  const handleLogout = useCallback(() => {
    const doLogout = () => {
      // Clear auth state synchronously before navigating.
      useAuthStore.setState({ user: null, isAuthenticated: false, pending2FA: null, error: null });
      // Navigate immediately — layout guards will now see isAuthenticated: false.
      router.replace('/(auth)/login');
      // Full async cleanup (token revocation, store cleanup) in the background.
      logout().catch(() => {});
    };

    if (Platform.OS === 'web') {
      // Alert.alert callbacks are unreliable on Expo Web — use browser confirm.
      // eslint-disable-next-line no-alert
      if (window.confirm('Sign out of admin?')) doLogout();
    } else {
      Alert.alert('Logout', 'Sign out of admin?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout },
      ]);
    }
  }, [router, logout]);

  const handleStatus = useCallback((s: string) => {
    setStatusFilter(s);
    applyFilters({ status: s });
  }, [applyFilters]);

  const handleUrgency = useCallback((u: string) => {
    setUrgencyFilter(u);
    applyFilters({ urgency: u });
  }, [applyFilters]);

  const handleSearch = useCallback((s: string) => {
    setSearch(s);
    if (searchDebounce) clearTimeout(searchDebounce);
    const t = setTimeout(() => applyFilters({ search: s }), 400);
    setSearchDebounce(t);
  }, [searchDebounce, applyFilters]);

  // ── Overview panel ────────────────────────────────────────────────────────

  const renderOverview = () => {
    if (!dashboard) return null;
    const { casesByStatus } = dashboard;
    return (
      <View>
        {/* Top stats row */}
        <View className="flex-row mb-3">
          <StatCard icon="people" label="Active Users (7d)" value={dashboard.activeUsers7d} color="#0AADA2" />
          <StatCard icon="document-text" label="Total Cases" value={dashboard.totalCases} color="#6366f1" />
          <StatCard icon="medkit" label="Total Patients" value={dashboard.totalPatients} color="#ec4899" />
        </View>

        {/* Second stats row */}
        <View className="flex-row mb-4">
          <StatCard icon="checkmark-circle" label="Physicians" value={dashboard.totalPhysicians} color="#8b5cf6" />
          <StatCard icon="radio-button-on" label="Available" value={dashboard.availablePhysicians} color="#22c55e" />
          <StatCard icon="today" label="Completed Today" value={dashboard.completedToday} color="#0ea5e9" />
        </View>

        {/* Case status breakdown */}
        <SectionHeader title="Cases by Status" icon="stats-chart" accent="#6366f1" />
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          {['Pending', 'Active', 'Completed'].map((s) => {
            const cnt = casesByStatus[s] ?? 0;
            const total = dashboard.totalCases || 1;
            const ratio = cnt / total;
            const style = STATUS_COLORS[s] ?? { bg: '#f1f5f9', text: '#475569' };
            return (
              <View key={s} className="mb-3 last:mb-0">
                <View className="flex-row justify-between mb-1">
                  <Text className="text-sm text-gray-600">{s}</Text>
                  <Text className="text-sm font-bold text-gray-800">{cnt}</Text>
                </View>
                <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: style.text }} />
                </View>
              </View>
            );
          })}
          {dashboard.escalatedToday > 0 && (
            <View className="flex-row items-center mt-3 pt-3 border-t border-gray-50">
              <Ionicons name="arrow-up-circle" size={14} color="#f97316" />
              <Text className="text-xs text-orange-600 ml-1 font-medium">
                {dashboard.escalatedToday} escalated today
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <SectionHeader title="Quick Actions" icon="flash" accent="#d97706" />
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/physician-payouts')}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="medkit-outline" size={20} color="#7c3aed" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Physician Payouts</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Review &amp; approve physician payout requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/medication-releases')}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ccfbf1', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="medical-outline" size={20} color="#0d9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Medication Releases</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Approve patient medication release requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/patient-messaging')}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mail-outline" size={20} color="#be185d" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Patient Email Broadcasts</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Draft reminders and promotional messages for all patients</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/patients')}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={20} color="#0369a1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Patient Management</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Export registrations CSV · bulk-import lab results</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/lifecoins-approvals')}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cash-outline" size={20} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Lifecoins Redemptions</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Review &amp; approve patient payout requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity
            disabled={exploreRefreshing}
            onPress={async () => {
              const doRefresh = async () => {
                setExploreRefreshing(true);
                try {
                  await triggerExploreRefresh();
                  if (Platform.OS === 'web') {
                    // eslint-disable-next-line no-alert
                    window.alert('Explore video refresh triggered. New videos will appear within a minute.');
                  } else {
                    Alert.alert('Refresh Triggered', 'Explore video refresh triggered. New videos will appear within a minute.');
                  }
                } catch {
                  if (Platform.OS === 'web') {
                    // eslint-disable-next-line no-alert
                    window.alert('Could not trigger explore refresh.');
                  } else {
                    Alert.alert('Error', 'Could not trigger explore refresh.');
                  }
                } finally {
                  setExploreRefreshing(false);
                }
              };
              if (Platform.OS === 'web') {
                // eslint-disable-next-line no-alert
                if (window.confirm('Re-fetch explore videos from YouTube?')) doRefresh();
              } else {
                Alert.alert('Refresh Explore Videos', 'Re-fetch explore videos from YouTube?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Refresh', onPress: doRefresh },
                ]);
              }
            }}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 4,
              opacity: exploreRefreshing ? 0.6 : 1,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
              {exploreRefreshing
                ? <ActivityIndicator size="small" color="#16a34a" />
                : <Ionicons name="refresh-circle-outline" size={22} color="#16a34a" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Refresh Explore Videos</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Re-fetch health videos from YouTube</Text>
            </View>
            {!exploreRefreshing && <Ionicons name="chevron-forward" size={16} color="#9ca3af" />}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── SLA panel ─────────────────────────────────────────────────────────────

  const renderSLA = () => {
    const slaCount = { green: 0, yellow: 0, red: 0 };
    slaItems.forEach((i) => { if (i.slaColor in slaCount) slaCount[i.slaColor as keyof typeof slaCount]++; });

    return (
      <View>
        {/* SLA summary chips */}
        <View className="flex-row mb-4">
          {(['green', 'yellow', 'red'] as const).map((c) => (
            <View key={c} className="flex-1 mx-1 rounded-xl p-3 items-center"
              style={{ backgroundColor: SLA_BG[c] }}>
              <Text className="text-xl font-bold" style={{ color: SLA_TEXT[c] }}>{slaCount[c]}</Text>
              <Text className="text-[11px] font-semibold mt-0.5 uppercase" style={{ color: SLA_TEXT[c] }}>{c}</Text>
            </View>
          ))}
        </View>

        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center py-2 mb-1">
            <Text className="text-xs font-semibold text-gray-500 flex-1">CASE</Text>
            <Text className="text-xs font-semibold text-gray-500">SLA</Text>
          </View>
          {slaItems.length === 0 ? (
            <View className="items-center py-8">
              <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
              <Text className="text-sm text-gray-500 mt-2">No pending cases — all caught up!</Text>
            </View>
          ) : (
            slaItems.map((item) => <SLARow key={item.id} item={item} />)
          )}
        </View>
        <Text className="text-[10px] text-gray-400 mt-2 text-center">
          SLA thresholds: &lt;4h GREEN · 4–24h YELLOW · &gt;24h RED (halved for HIGH/CRITICAL)
        </Text>
      </View>
    );
  };

  // ── EDIS panel ────────────────────────────────────────────────────────────

  const renderEDIS = () => {
    if (!edisMetrics) return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    const maxFlag = edisMetrics.flagFrequency.length > 0 ? Math.max(...edisMetrics.flagFrequency.map((f) => f.count)) : 1;
    return (
      <View>
        {/* Key metrics */}
        <View className="flex-row mb-3">
          <StatCard icon="arrow-up-circle" label="Escalation Rate" value={pct(edisMetrics.escalationRatePct)} color="#f97316" />
          <StatCard icon="pulse" label="Avg Confidence" value={`${round1(edisMetrics.avgConfidence)}%`} color="#0AADA2" />
          <StatCard icon="warning" label="Low Conf. Rate" value={pct(edisMetrics.lowConfidencePct)} color="#eab308" />
        </View>
        <View className="flex-row mb-4">
          <StatCard icon="medkit" label="Total Diagnoses" value={edisMetrics.totalDiagnoses} color="#6366f1" />
          <StatCard icon="list" label="Avg Conditions" value={round1(edisMetrics.avgConditionsPerCase)} color="#ec4899" />
          <StatCard icon="time" label="Period" value={`${edisMetrics.periodDays}d`} color="#64748b" />
        </View>

        {/* Flag frequency */}
        <SectionHeader title="Risk Flag Frequency" icon="flag" accent="#ef4444" />
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          {edisMetrics.flagFrequency.length === 0 ? (
            <Text className="text-sm text-gray-400 text-center py-4">No risk flags detected in this period</Text>
          ) : (
            edisMetrics.flagFrequency.map((f) => (
              <FlagBar key={f.flag} flag={f.flag} count={f.count} max={maxFlag} />
            ))
          )}
        </View>

        {/* Escalation detail */}
        <SectionHeader title="Escalations" icon="arrow-up-circle" accent="#f97316" />
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between py-2 border-b border-gray-50">
            <Text className="text-sm text-gray-600">Total escalated</Text>
            <Text className="text-sm font-bold text-gray-900">{edisMetrics.escalationCount}</Text>
          </View>
          <View className="flex-row items-center justify-between py-2 border-b border-gray-50">
            <Text className="text-sm text-gray-600">Low confidence cases</Text>
            <Text className="text-sm font-bold text-gray-900">{edisMetrics.lowConfidenceCount}</Text>
          </View>
          <View className="flex-row items-center justify-between py-2">
            <Text className="text-sm text-gray-600">Escalation threshold</Text>
            <View className="bg-orange-50 px-2 py-0.5 rounded">
              <Text className="text-xs font-semibold text-orange-700">HIGH / CRITICAL urgency</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ── Physicians panel ──────────────────────────────────────────────────────

  const renderPhysicians = () => {
    const available = physicians.filter((p) => p.available).length;
    const flagged   = physicians.filter((p) => p.flagged).length;
    return (
      <View>
        <View className="flex-row mb-4">
          <StatCard icon="people" label="Total" value={physicians.length} color="#8b5cf6" />
          <StatCard icon="radio-button-on" label="Available" value={available} color="#22c55e" />
          <StatCard icon="alert-circle" label="Busy" value={physicians.length - available} color="#f97316" />
        </View>
        {flagged > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/physicians')}
            className="flex-row items-center bg-red-50 border border-red-100 rounded-2xl px-4 py-2.5 mb-3"
          >
            <Ionicons name="flag" size={16} color="#dc2626" />
            <Text className="text-sm font-semibold text-red-700 ml-2 flex-1">
              {flagged} physician{flagged !== 1 ? 's' : ''} flagged for SLA breaches
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#dc2626" />
          </TouchableOpacity>
        )}
        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          {physicians.length === 0 ? (
            <View className="items-center py-8">
              <Ionicons name="people-outline" size={32} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-2">No physicians registered</Text>
            </View>
          ) : (
            physicians.slice(0, 5).map((p) => (
              <PhysicianCard
                key={p.id}
                p={p}
                onPress={() => router.push(`/(admin-tab)/physician-detail?id=${p.id}`)}
              />
            ))
          )}
          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/physicians')}
            className="flex-row items-center justify-center py-3 mt-1"
          >
            <Text className="text-sm font-semibold text-indigo-600">Manage All Physicians</Text>
            <Ionicons name="arrow-forward" size={15} color="#6366f1" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Cases panel ───────────────────────────────────────────────────────────

  const renderCases = () => (
    <View>
      <FilterBar
        statusFilter={statusFilter}
        urgencyFilter={urgencyFilter}
        search={search}
        onStatus={handleStatus}
        onUrgency={handleUrgency}
        onSearch={handleSearch}
      />
      <Text className="text-xs text-gray-400 mb-2">{casesTotal} case{casesTotal !== 1 ? 's' : ''} found</Text>
      {cases.length === 0 ? (
        <View className="items-center py-12">
          <Ionicons name="folder-open-outline" size={36} color="#d1d5db" />
          <Text className="text-sm text-gray-400 mt-2">No cases match the current filters</Text>
        </View>
      ) : (
        cases.map((item) => <CaseRow key={item.id} item={item} />)
      )}
    </View>
  );

  // ── Breach Alerts panel ────────────────────────────────────────────────────

  const renderBreachAlerts = () => {
    if (breachAlertsLoading) {
      return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    }
    const total = slaBreachAlerts.length;
    const unresolved = slaBreachAlerts.filter((a) => !a.newPhysicianName).length;
    return (
      <View>
        {/* Summary chips */}
        <View className="flex-row mb-4">
          <View className="flex-1 mx-1 rounded-xl p-3 items-center" style={{ backgroundColor: '#fee2e2' }}>
            <Text className="text-xl font-bold text-red-700">{total}</Text>
            <Text className="text-[11px] font-semibold text-red-700 mt-0.5 uppercase">Total Breaches</Text>
          </View>
          <View className="flex-1 mx-1 rounded-xl p-3 items-center" style={{ backgroundColor: '#fef9c3' }}>
            <Text className="text-xl font-bold text-yellow-700">{unresolved}</Text>
            <Text className="text-[11px] font-semibold text-yellow-700 mt-0.5 uppercase">Unresolved</Text>
          </View>
          <View className="flex-1 mx-1 rounded-xl p-3 items-center" style={{ backgroundColor: '#dcfce7' }}>
            <Text className="text-xl font-bold text-green-700">{total - unresolved}</Text>
            <Text className="text-[11px] font-semibold text-green-700 mt-0.5 uppercase">Reassigned</Text>
          </View>
        </View>

        {/* Event list */}
        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between py-2 mb-1">
            <Text className="text-xs font-semibold text-gray-500">BREACH EVENTS (MOST RECENT FIRST)</Text>
            <TouchableOpacity onPress={() => fetchSLABreachAlerts()}>
              <Ionicons name="refresh" size={15} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {slaBreachAlerts.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="shield-checkmark" size={36} color="#22c55e" />
              <Text className="text-sm font-semibold text-green-700 mt-2">No SLA breaches detected</Text>
              <Text className="text-xs text-gray-400 mt-1 text-center">
                All cases have been handled within the 4-hour SLA window.
              </Text>
            </View>
          ) : (
            slaBreachAlerts.map((item) => <BreachAlertRow key={item.id} item={item} />)
          )}
        </View>
        <Text className="text-[10px] text-gray-400 mt-2 text-center">
          SLA window: 4 hours · NATS subject: admin.sla.breach.alert
        </Text>
      </View>
    );
  };

  // ── Reassignment Log panel ─────────────────────────────────────────────────

  const renderReassignmentLog = () => {
    if (reassignmentLogLoading) {
      return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    }
    return (
      <View>
        {/* Header stat */}
        <View className="bg-indigo-50 rounded-2xl p-4 mb-4 flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center mr-3">
            <Ionicons name="swap-horizontal" size={20} color="#6366f1" />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-indigo-700">{reassignmentLogTotal}</Text>
            <Text className="text-xs text-indigo-500 mt-0.5">Total auto-reassignments (all time)</Text>
          </View>
        </View>

        {/* Log */}
        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between py-2 mb-1">
            <Text className="text-xs font-semibold text-gray-500">AUTO-REASSIGNMENT LOG</Text>
            <TouchableOpacity onPress={() => fetchReassignmentLog()}>
              <Ionicons name="refresh" size={15} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {reassignmentLog.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="swap-horizontal-outline" size={36} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-2">No reassignments recorded yet</Text>
            </View>
          ) : (
            reassignmentLog.map((item, idx) => (
              <ReassignmentRow key={item.id} item={item} index={idx} />
            ))
          )}
        </View>
        {reassignmentLog.length > 0 && (
          <Text className="text-[10px] text-gray-400 mt-2 text-center">
            Showing {reassignmentLog.length} of {reassignmentLogTotal} reassignment{reassignmentLogTotal !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
    );
  };

  // ── Audit Log panel ───────────────────────────────────────────────────────

  const [auditEventTypeFilter, setAuditEventTypeFilter] = useState('');
  const [auditRoleFilter, setAuditRoleFilter] = useState('');

  const EVENT_TYPES = ['', 'case.status_change', 'case.reviewed', 'case.escalated', 'admin.action', 'auth.login', 'auth.logout'];
  const ACTOR_ROLES = ['', 'admin', 'physician', 'patient', 'system'];

  const renderAuditLog = () => {
    if (auditLoading) return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    return (
      <View>
        {/* Event type filter */}
        <Text className="text-xs font-semibold text-gray-500 mb-1.5 uppercase">Filter by Event</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {EVENT_TYPES.map((et) => (
            <TouchableOpacity
              key={et || 'all-events'}
              onPress={() => {
                setAuditEventTypeFilter(et);
                fetchAuditLog({ eventType: et, actorRole: auditRoleFilter, page: 1 });
              }}
              className="mr-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: auditEventTypeFilter === et ? '#6366f1' : '#f1f5f9' }}>
              <Text className="text-xs font-medium" style={{ color: auditEventTypeFilter === et ? '#fff' : '#64748b' }}>
                {et || 'All Events'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Role filter */}
        <Text className="text-xs font-semibold text-gray-500 mb-1.5 uppercase">Filter by Role</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {ACTOR_ROLES.map((r) => (
            <TouchableOpacity
              key={r || 'all-roles'}
              onPress={() => {
                setAuditRoleFilter(r);
                fetchAuditLog({ eventType: auditEventTypeFilter, actorRole: r, page: 1 });
              }}
              className="mr-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: auditRoleFilter === r ? '#0AADA2' : '#f1f5f9' }}>
              <Text className="text-xs font-medium" style={{ color: auditRoleFilter === r ? '#fff' : '#64748b' }}>
                {r || 'All Roles'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text className="text-xs text-gray-400 mb-2">{auditTotal} event{auditTotal !== 1 ? 's' : ''} found</Text>

        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between py-2 mb-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase">Audit Events (Most Recent First)</Text>
            <TouchableOpacity onPress={() => fetchAuditLog({ page: 1 })}>
              <Ionicons name="refresh" size={15} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {auditEvents.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="document-text-outline" size={36} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-2">No audit events match the filters</Text>
            </View>
          ) : (
            auditEvents.map((item) => <AuditEventRow key={item.id} item={item} />)
          )}
        </View>
      </View>
    );
  };

  // ── Transactions panel ────────────────────────────────────────────────────

  const [txStatusFilter, setTxStatusFilter] = useState('');
  const TX_STATUSES = ['', 'success', 'pending', 'failed'];

  const renderTransactions = () => {
    if (transactionsLoading) return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    return (
      <View>
        {/* Summary */}
        <View className="flex-row mb-4">
          <StatCard icon="card" label="Total Transactions" value={transactionsTotal} color="#6366f1" />
          <StatCard icon="cash" label="Total Volume (₦)" value={totalAmount.toLocaleString('en-NG')} color="#22c55e" />
        </View>

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {TX_STATUSES.map((s) => (
            <TouchableOpacity
              key={s || 'all-tx'}
              onPress={() => {
                setTxStatusFilter(s);
                fetchAllTransactions(s, 1);
              }}
              className="mr-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: txStatusFilter === s ? '#0AADA2' : '#f1f5f9' }}>
              <Text className="text-xs font-medium" style={{ color: txStatusFilter === s ? '#fff' : '#64748b' }}>
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Status'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="bg-white rounded-2xl px-4 py-2"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between py-2 mb-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase">Payment Transactions</Text>
            <TouchableOpacity onPress={() => fetchAllTransactions(txStatusFilter, 1)}>
              <Ionicons name="refresh" size={15} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {transactions.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="card-outline" size={36} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-2">No transactions found</Text>
            </View>
          ) : (
            transactions.map((item) => <TransactionRow key={item.id} item={item} />)
          )}
        </View>
      </View>
    );
  };

  // ── Compliance panel ──────────────────────────────────────────────────────

  const renderCompliance = () => {
    if (complianceLoading) return <View className="items-center py-12"><ActivityIndicator color="#0AADA2" /></View>;
    const latest = ndpaSnapshots[0] ?? null;
    return (
      <View>
        {/* NDPA summary from latest snapshot */}
        {latest ? (
          <View>
            <View className="bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center mb-3">
                <View className="w-9 h-9 rounded-full bg-teal-100 items-center justify-center mr-3">
                  <Ionicons name="shield-checkmark" size={18} color="#0d9488" />
                </View>
                <View>
                  <Text className="text-base font-bold text-teal-800">NDPA 2023 Status</Text>
                  <Text className="text-xs text-teal-600">
                    Snapshot: {new Date(latest.snapshotDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
              <View className="gap-2">
                <NDPAMetricRow label="Consent Captured" value={`${latest.consentCapturedPct.toFixed(1)}%`} ok={latest.consentCapturedPct >= 95} />
                <NDPAMetricRow label="Data Minimisation" value={latest.dataMinimisationOk ? 'Compliant' : 'Review Needed'} ok={latest.dataMinimisationOk} />
                <NDPAMetricRow label="Retention Policy" value={latest.retentionPolicyOk ? 'Compliant' : 'Review Needed'} ok={latest.retentionPolicyOk} />
                <NDPAMetricRow label="Breach Incidents (30d)" value={String(latest.breachIncidents30d)} ok={latest.breachIncidents30d === 0} />
                <NDPAMetricRow label="Pending DSAR" value={String(latest.pendingDsar)} ok={latest.pendingDsar === 0} />
                <NDPAMetricRow label="Data Subjects" value={latest.totalDataSubjects.toLocaleString()} ok />
              </View>
            </View>
          </View>
        ) : (
          <View className="bg-gray-50 rounded-2xl p-6 mb-4 items-center">
            <Ionicons name="shield-outline" size={36} color="#d1d5db" />
            <Text className="text-sm text-gray-400 mt-2">No compliance snapshots yet</Text>
          </View>
        )}

        {/* Action buttons */}
        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={async () => {
              try {
                await generateNDPASnapshot();
                Alert.alert('Success', 'Compliance snapshot generated');
              } catch {
                Alert.alert('Error', 'Could not generate snapshot');
              }
            }}
            className="flex-1 flex-row items-center justify-center bg-teal-600 rounded-xl py-3">
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white ml-2">Generate Snapshot</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin-tab)/alert-settings')}
            className="flex-1 flex-row items-center justify-center bg-indigo-600 rounded-xl py-3">
            <Ionicons name="settings-outline" size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white ml-2">Alert Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Snapshot history */}
        {ndpaSnapshots.length > 1 && (
          <View>
            <SectionHeader title="Snapshot History" icon="time" accent="#0d9488" />
            <View className="bg-white rounded-2xl px-4 py-2"
              style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
              {ndpaSnapshots.slice(1).map((snap) => (
                <View key={snap.id} className="py-3 border-b border-gray-50 flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-800">
                      {new Date(snap.snapshotDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">
                      Consent: {snap.consentCapturedPct.toFixed(1)}% · Breaches: {snap.breachIncidents30d} · DSAR: {snap.pendingDsar}
                    </Text>
                  </View>
                  <View className="w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: (snap.dataMinimisationOk && snap.retentionPolicyOk && snap.breachIncidents30d === 0) ? '#dcfce7' : '#fee2e2' }}>
                    <Ionicons
                      name={(snap.dataMinimisationOk && snap.retentionPolicyOk && snap.breachIncidents30d === 0) ? 'checkmark' : 'close'}
                      size={12}
                      color={(snap.dataMinimisationOk && snap.retentionPolicyOk && snap.breachIncidents30d === 0) ? '#16a34a' : '#dc2626'}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  // ── Analytics panel ───────────────────────────────────────────────────────

  const renderAnalytics = () => {
    const isWide = Platform.OS === 'web';
    const a = analyticsData;

    // ── Sub-components (defined inline so they close over `a`) ─────────────

    const PeriodBtn = ({ d, label }: { d: number; label: string }) => (
      <TouchableOpacity
        onPress={() => { setAnalyticsDays(d); fetchAnalytics(d); }}
        className="px-4 py-1.5 rounded-full mr-2"
        style={{ backgroundColor: analyticsDays === d ? '#0AADA2' : '#e2e8f0' }}>
        <Text className="text-xs font-bold"
          style={{ color: analyticsDays === d ? '#fff' : '#64748b' }}>{label}</Text>
      </TouchableOpacity>
    );

    // Compact KPI badge
    const KPI = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
      <View className="flex-1 mx-1 bg-white rounded-2xl p-3"
        style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, minWidth: 80 }}>
        <View className="w-7 h-1 rounded-full mb-2" style={{ backgroundColor: color }} />
        <Text className="text-xl font-black text-gray-900 leading-tight">{value}</Text>
        {sub && <Text className="text-[10px] font-semibold mt-0.5" style={{ color }}>{sub}</Text>}
        <Text className="text-[10px] text-gray-400 mt-0.5 leading-snug">{label}</Text>
      </View>
    );

    // Horizontal bar row
    const HBar = ({ label, count, pct, color, rank }: {
      label: string; count: number; pct: number; color: string; rank?: number;
    }) => (
      <View className="mb-2.5">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1 mr-2">
            {rank !== undefined && (
              <Text className="text-[10px] font-bold w-5 text-gray-400 mr-1">#{rank + 1}</Text>
            )}
            <Text className="text-xs text-gray-700 flex-1" numberOfLines={1}>{label}</Text>
          </View>
          <Text className="text-xs font-bold text-gray-800">{count.toLocaleString()}</Text>
          <Text className="text-[10px] text-gray-400 w-10 text-right">{pct.toFixed(1)}%</Text>
        </View>
        <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: color + '22' }}>
          <View className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
        </View>
      </View>
    );

    // Mini sparkline bar chart
    const Spark = ({ points, color, label, note }: {
      points: { date: string; count: number }[]; color: string; label: string; note?: string;
    }) => {
      const vals = points.slice(-21);
      const max = Math.max(...vals.map(p => p.count), 1);
      const total = vals.reduce((s, p) => s + p.count, 0);
      return (
        <View className="bg-white rounded-2xl p-4 flex-1 mx-1"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, minHeight: 110 }}>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-bold text-gray-600">{label}</Text>
            <Text className="text-xs font-black" style={{ color }}>{total.toLocaleString()}</Text>
          </View>
          <View className="flex-row items-end flex-1" style={{ gap: 2, height: 44 }}>
            {vals.map((p, i) => (
              <View key={i} className="flex-1 rounded-t-sm"
                style={{
                  height: Math.max(3, (p.count / max) * 44),
                  backgroundColor: i === vals.length - 1 ? color : color + '55',
                }} />
            ))}
          </View>
          {note && <Text className="text-[9px] text-gray-400 mt-1">{note}</Text>}
        </View>
      );
    };

    // Revenue sparkline (uses amount not count)
    const RevSpark = ({ points, color, label }: {
      points: { date: string; amount: number }[]; color: string; label: string;
    }) => {
      const vals = points.slice(-21);
      const max = Math.max(...vals.map(p => p.amount), 1);
      const total = vals.reduce((s, p) => s + p.amount, 0);
      return (
        <View className="bg-white rounded-2xl p-4 flex-1 mx-1"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, minHeight: 110 }}>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-bold text-gray-600">{label}</Text>
            <Text className="text-xs font-black" style={{ color }}>₦{total.toLocaleString('en-NG')}</Text>
          </View>
          <View className="flex-row items-end flex-1" style={{ gap: 2, height: 44 }}>
            {vals.map((p, i) => (
              <View key={i} className="flex-1 rounded-t-sm"
                style={{
                  height: Math.max(3, (p.amount / max) * 44),
                  backgroundColor: i === vals.length - 1 ? color : color + '55',
                }} />
            ))}
          </View>
        </View>
      );
    };

    // Section card wrapper
    const Card = ({ children, className: cn2 }: { children: React.ReactNode; className?: string }) => (
      <View className={`bg-white rounded-2xl p-4 mb-4 ${cn2 ?? ''}`}
        style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 }}>
        {children}
      </View>
    );

    // Small stat pill
    const Pill = ({ label, value, color }: { label: string; value: string; color: string }) => (
      <View className="rounded-xl px-3 py-2 mr-2 mb-2" style={{ backgroundColor: color + '15' }}>
        <Text className="text-[10px] text-gray-500">{label}</Text>
        <Text className="text-sm font-black" style={{ color }}>{value}</Text>
      </View>
    );

    if (analyticsLoading && !a) {
      return (
        <View className="items-center py-20">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="text-gray-400 mt-4 text-sm font-medium">Loading analytics…</Text>
        </View>
      );
    }

    const fmtNaira = (v: number) => `₦${v.toLocaleString('en-NG')}`;
    const fmtPct = (v: number) => `${v.toFixed(1)}%`;
    const fmtMins = (v: number) => v >= 60 ? `${(v / 60).toFixed(1)}h` : `${Math.round(v)}m`;

    return (
      <View>

        {/* ── Period selector ────────────────────────────────────────────── */}
        <View className="flex-row items-center mb-5">
          <PeriodBtn d={7} label="7 days" />
          <PeriodBtn d={30} label="30 days" />
          <PeriodBtn d={90} label="90 days" />
          {analyticsLoading && <ActivityIndicator size="small" color="#0AADA2" style={{ marginLeft: 8 }} />}
        </View>

        {/* ── Global KPIs strip ──────────────────────────────────────────── */}
        <View className={`flex-row mb-4 ${isWide ? 'flex-wrap' : ''}`}>
          <KPI label="Registered Patients" value={(a?.totalRegisteredUsers ?? 0).toLocaleString()} color="#0AADA2" />
          <KPI label="Physicians" value={(a?.totalRegisteredPhysicians ?? 0).toLocaleString()} color="#6366f1" />
          <KPI label="Avg Cases/Patient" value={(a?.avgCasesPerPatient ?? 0).toFixed(1)} color="#f97316" />
        </View>
        <View className={`flex-row mb-6 ${isWide ? 'flex-wrap' : ''}`}>
          <KPI label={`New Patients (${a?.periodDays ?? 30}d)`} value={(a?.newUsersTotal ?? 0).toLocaleString()}
            sub={`+${a?.newPhysiciansTotal ?? 0} physicians`} color="#22c55e" />
          <KPI label="Completed Cases" value={(a?.totalCompletedCases ?? 0).toLocaleString()}
            sub={fmtPct(a?.completionRatePct ?? 0)} color="#0ea5e9" />
          <KPI label="Escalated Cases" value={(a?.totalEscalatedCases ?? 0).toLocaleString()}
            sub={fmtPct(a?.escalationRatePct ?? 0)} color="#ef4444" />
        </View>

        {/* ── Revenue ────────────────────────────────────────────────────── */}
        <SectionHeader title="Revenue" icon="cash" accent="#22c55e" />
        <Card>
          <View className={`flex-row flex-wrap mb-3`}>
            <Pill label={`Period Revenue (${a?.periodDays ?? 30}d)`} value={fmtNaira(a?.revenuePeriodTotal ?? 0)} color="#22c55e" />
            <Pill label="All-Time Revenue" value={fmtNaira(a?.totalRevenueAllTime ?? 0)} color="#0ea5e9" />
            <Pill label="Paying Users" value={(a?.totalPayingUsers ?? 0).toLocaleString()} color="#6366f1" />
            <Pill label="Transactions" value={(a?.totalTransactions ?? 0).toLocaleString()} color="#f97316" />
            <Pill label="Avg / User" value={fmtNaira(Math.round(a?.avgRevenuePerUser ?? 0))} color="#0AADA2" />
          </View>
          <RevSpark points={a?.dailyRevenue ?? []} color="#22c55e" label="Daily Revenue" />
        </Card>

        {/* ── Acquisition trend ─────────────────────────────────────────── */}
        <SectionHeader title="Acquisition" icon="person-add" accent="#0AADA2" />
        <View className="flex-row mb-4">
          <Spark points={a?.dailyNewUsers ?? []} color="#0AADA2" label="New Patients/day" />
          <Spark points={a?.dailyNewCases ?? []} color="#ec4899" label="New Cases/day" />
        </View>

        {/* ── Engagement trend ──────────────────────────────────────────── */}
        <SectionHeader title="Engagement" icon="pulse" accent="#6366f1" />
        <View className="flex-row mb-4">
          <Spark points={a?.dailyActivePatients ?? []} color="#6366f1" label="Active Patients/day" />
          <Spark points={a?.dailyPhysicianResolutions ?? []} color="#f97316" label="Physician Resolutions/day" />
        </View>

        {/* ── Retention ─────────────────────────────────────────────────── */}
        <SectionHeader title="Retention" icon="refresh-circle" accent="#22c55e" />
        <Card>
          <View className="flex-row">
            <View className="flex-1 items-center py-2">
              <Text className="text-3xl font-black" style={{ color: '#22c55e' }}>{fmtPct(a?.retentionD7 ?? 0)}</Text>
              <Text className="text-xs text-gray-500 mt-1">Day-7 Retention</Text>
              <Text className="text-[10px] text-gray-400 mt-0.5">Users who returned after 7 days</Text>
            </View>
            <View className="w-px bg-gray-100" />
            <View className="flex-1 items-center py-2">
              <Text className="text-3xl font-black" style={{ color: '#0ea5e9' }}>{fmtPct(a?.retentionD30 ?? 0)}</Text>
              <Text className="text-xs text-gray-500 mt-1">Day-30 Retention</Text>
              <Text className="text-[10px] text-gray-400 mt-0.5">Users who returned after 30 days</Text>
            </View>
          </View>
        </Card>

        {/* ── Case outcomes ─────────────────────────────────────────────── */}
        <SectionHeader title="Case Outcomes" icon="checkmark-done-circle" accent="#8b5cf6" />
        <Card>
          <View className="flex-row flex-wrap">
            <Pill label="Completion Rate" value={fmtPct(a?.completionRatePct ?? 0)} color="#22c55e" />
            <Pill label="Escalation Rate" value={fmtPct(a?.escalationRatePct ?? 0)} color="#ef4444" />
            <Pill label="Avg Resolution Time" value={fmtMins(a?.avgCaseDurationMins ?? 0)} color="#8b5cf6" />
          </View>
          <View className="mt-3">
            {(a?.urgencyBreakdown ?? []).map((u, i) => (
              <HBar key={i} label={u.label} count={u.count} pct={u.pct}
                color={URGENCY_COLORS[u.label] ?? '#94a3b8'} />
            ))}
          </View>
        </Card>

        {/* ── Top medical conditions ────────────────────────────────────── */}
        <SectionHeader title="Top Medical Conditions" icon="medkit" accent="#ec4899" />
        <Card>
          {(a?.topConditions ?? []).map((c, i) => (
            <HBar key={i} label={c.label} count={c.count} pct={c.pct} color="#ec4899" rank={i} />
          ))}
          {(a?.topConditions ?? []).length === 0 && (
            <Text className="text-sm text-gray-400 text-center py-4">No condition data yet</Text>
          )}
        </Card>

        {/* ── Geographic distribution ───────────────────────────────────── */}
        <SectionHeader title="Geographic Distribution" icon="globe" accent="#0ea5e9" />
        <View className={isWide ? 'flex-row gap-3 mb-1' : ''}>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Country</Text>
            {(a?.countryBreakdown ?? []).map((c, i) => (
              <HBar key={i} label={c.label} count={c.count} pct={c.pct} color="#0ea5e9" rank={i} />
            ))}
            {(a?.countryBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 text-center py-2">No data</Text>
            )}
          </Card>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">State / Region</Text>
            {(a?.stateBreakdown ?? []).map((s, i) => (
              <HBar key={i} label={s.label} count={s.count} pct={s.pct} color="#6366f1" rank={i} />
            ))}
            {(a?.stateBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 text-center py-2">No data</Text>
            )}
          </Card>
        </View>

        {/* ── Patient demographics ──────────────────────────────────────── */}
        <SectionHeader title="Patient Demographics" icon="people" accent="#8b5cf6" />
        {/* Gender & Language row */}
        <View className={isWide ? 'flex-row gap-3 mb-1' : ''}>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Gender</Text>
            {(a?.genderBreakdown ?? []).map((g, i) => (
              <HBar key={i} label={g.label} count={g.count} pct={g.pct}
                color={['#0AADA2','#6366f1','#ec4899'][i] ?? '#94a3b8'} />
            ))}
          </Card>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Language</Text>
            {(a?.languageBreakdown ?? []).map((l, i) => (
              <HBar key={i} label={l.label} count={l.count} pct={l.pct} color="#f97316" rank={i} />
            ))}
            {(a?.languageBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 text-center py-2">No data</Text>
            )}
          </Card>
        </View>
        {/* Age groups */}
        <Card>
          <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Age Groups</Text>
          <View className={isWide ? 'flex-row flex-wrap' : ''}>
            {(a?.ageGroupBreakdown ?? []).map((ag, i) => {
              const colors = ['#0AADA2','#6366f1','#ec4899','#f97316','#22c55e','#0ea5e9','#8b5cf6'];
              return (
                <View key={i} className={isWide ? 'w-1/3 pr-4 mb-2' : 'mb-2'}>
                  <HBar label={ag.label} count={ag.count} pct={ag.pct}
                    color={colors[i % colors.length]} />
                </View>
              );
            })}
            {(a?.ageGroupBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 py-2">No DOB data on file</Text>
            )}
          </View>
        </Card>
        {/* Blood type & Genotype row */}
        <View className={isWide ? 'flex-row gap-3 mb-1' : ''}>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Blood Type</Text>
            {(a?.bloodTypeBreakdown ?? []).map((b, i) => (
              <HBar key={i} label={b.label} count={b.count} pct={b.pct} color="#ef4444" />
            ))}
            {(a?.bloodTypeBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 text-center py-2">No data</Text>
            )}
          </Card>
          <Card className={isWide ? 'flex-1' : ''}>
            <Text className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Genotype</Text>
            {(a?.genotypeBreakdown ?? []).map((g, i) => (
              <HBar key={i} label={g.label} count={g.count} pct={g.pct} color="#eab308" />
            ))}
            {(a?.genotypeBreakdown ?? []).length === 0 && (
              <Text className="text-sm text-gray-400 text-center py-2">No data</Text>
            )}
          </Card>
        </View>

        {/* ── Top Physicians leaderboard ────────────────────────────────── */}
        <SectionHeader title="Top Physicians" icon="trophy" accent="#f97316" />
        <Card>
          {(a?.topPhysicians ?? []).map((p, i) => {
            const max = Math.max(...(a?.topPhysicians ?? []).map(x => x.resolvedCases), 1);
            const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];
            return (
              <View key={i} className="mb-3 last:mb-0">
                <View className="flex-row items-center mb-1.5">
                  <View className="w-6 h-6 rounded-full items-center justify-center mr-2"
                    style={{ backgroundColor: i < 3 ? medalColors[i] + '25' : '#f1f5f9' }}>
                    <Text className="text-[10px] font-black"
                      style={{ color: i < 3 ? medalColors[i] : '#94a3b8' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </Text>
                  </View>
                  <Text className="flex-1 text-sm font-semibold text-gray-800" numberOfLines={1}>{p.name}</Text>
                  <Text className="text-sm font-black" style={{ color: '#f97316' }}>
                    {p.resolvedCases} {p.resolvedCases === 1 ? 'case' : 'cases'}
                  </Text>
                </View>
                <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#f97316' + '20' }}>
                  <View className="h-full rounded-full"
                    style={{ width: `${(p.resolvedCases / max) * 100}%`, backgroundColor: i === 0 ? '#f97316' : '#fdba74' }} />
                </View>
              </View>
            );
          })}
          {(a?.topPhysicians ?? []).length === 0 && (
            <Text className="text-sm text-gray-400 text-center py-4">No resolved cases yet</Text>
          )}
        </Card>

        {/* ── Session / Engagement Time ─────────────────────────────────── */}
        <SectionHeader title="Session & Engagement" icon="time" accent="#8b5cf6" />
        {/* KPI cards row */}
        <View className="flex-row -mx-1 mb-3">
          <KPI
            label="Avg Patient Session"
            value={`${(a?.avgSessionMinsPatient ?? 0).toFixed(1)} min`}
            color="#8b5cf6"
          />
          <KPI
            label="Avg Physician Session"
            value={`${(a?.avgSessionMinsPhysician ?? 0).toFixed(1)} min`}
            color="#06b6d4"
          />
        </View>
        <View className="flex-row -mx-1 mb-3">
          <KPI
            label="Patient Sessions"
            value={(a?.totalSessionsPatient ?? 0).toLocaleString()}
            color="#8b5cf6"
          />
          <KPI
            label="Physician Sessions"
            value={(a?.totalSessionsPhysician ?? 0).toLocaleString()}
            color="#06b6d4"
          />
        </View>
        <Card>
          <View className="flex-row flex-wrap">
            <Pill label="Avg Sessions / Patient" value={(a?.avgSessionsPerPatient ?? 0).toFixed(2)} color="#8b5cf6" />
          </View>
        </Card>
        {/* Daily avg session duration as sparkline (map FloatPoint → DailyPoint-like) */}
        {(a?.dailyAvgSessionMins ?? []).length > 0 && (
          <View className="flex-row -mx-1 mb-3">
            <Spark
              points={(a?.dailyAvgSessionMins ?? []).map(p => ({ date: p.date, count: Math.round(p.value) }))}
              color="#8b5cf6"
              label="Daily Avg Session (min)"
            />
          </View>
        )}
        {/* Daily session counts */}
        {((a?.dailySessionsPatient ?? []).length > 0 || (a?.dailySessionsPhysician ?? []).length > 0) && (
          <View className="flex-row -mx-1 mb-4">
            {(a?.dailySessionsPatient ?? []).length > 0 && (
              <Spark
                points={a?.dailySessionsPatient ?? []}
                color="#8b5cf6"
                label="Patient Sessions/day"
              />
            )}
            {(a?.dailySessionsPhysician ?? []).length > 0 && (
              <Spark
                points={a?.dailySessionsPhysician ?? []}
                color="#06b6d4"
                label="Physician Sessions/day"
              />
            )}
          </View>
        )}

      </View>
    );
  };

  // ── Panel renderer ────────────────────────────────────────────────────────

  const renderPanel = () => {
    switch (activePanel) {
      case 'overview':      return renderOverview();
      case 'sla':           return renderSLA();
      case 'breaches':      return renderBreachAlerts();
      case 'reassignments': return renderReassignmentLog();
      case 'edis':          return renderEDIS();
      case 'physicians':    return renderPhysicians();
      case 'cases':         return renderCases();
      case 'audit':         return renderAuditLog();
      case 'transactions':  return renderTransactions();
      case 'compliance':    return renderCompliance();
      case 'analytics':     return renderAnalytics();
    }
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <LinearGradient
        colors={['#0AADA2', '#07827A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        className="px-5 pt-4 pb-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-white text-xl font-bold">Admin Dashboard</Text>
            <Text className="text-white/70 text-xs mt-0.5">{user?.name ?? ''}</Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            className="w-9 h-9 rounded-full bg-white/15 items-center justify-center">
            <Ionicons name="log-out-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Panel tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4 -mx-1">
          {PANELS.map((panel) => {
            const active = activePanel === panel.key;
            const hasBadge = panel.key === 'breaches' && slaBreachAlerts.length > 0;
            return (
              <TouchableOpacity
                key={panel.key}
                onPress={() => setActivePanel(panel.key)}
                className="mx-1 px-3 py-1.5 rounded-xl flex-row items-center"
                style={{ backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.15)' }}>
                <Ionicons name={panel.icon as any} size={13} color={active ? '#0AADA2' : '#fff'} />
                <Text className="ml-1.5 text-xs font-semibold"
                  style={{ color: active ? '#0AADA2' : '#fff' }}>
                  {panel.label}
                </Text>
                {hasBadge && (
                  <View className="ml-1 w-4 h-4 rounded-full bg-red-500 items-center justify-center">
                    <Text className="text-[9px] font-bold text-white">
                      {slaBreachAlerts.length > 99 ? '99+' : slaBreachAlerts.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {/* Body */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="text-sm text-gray-500 mt-3">Loading admin data…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0AADA2" />}
          showsVerticalScrollIndicator={false}>
          {renderPanel()}
          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
