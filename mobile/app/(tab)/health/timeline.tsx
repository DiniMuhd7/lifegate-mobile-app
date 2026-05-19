import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useHealthStore } from 'stores/health-store';
import { useAuthStore } from 'stores/auth/auth-store';
import type { HealthTimelineEntry } from 'types/health-types';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { BannerAd } from 'components/BannerAd';
import { usePaymentStore } from 'stores/payment-store';
import { SeverityLineChart } from 'components/SeverityLineChart';

// ─── Types ────────────────────────────────────────────────────────────────────

type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type DateFilter = '7d' | '30d' | '90d' | 'all';
type SeverityFilter = 'ALL' | Urgency;

// ─── Config maps ──────────────────────────────────────────────────────────────

const URGENCY = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: 'Low Risk'  },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Moderate'  },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'High Risk' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', dot: '#a855f7', label: 'Critical'  },
} as const;

const URGENCY_RANK: Record<Urgency, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

const URGENCY_LABEL: Record<string, string> = {
  LOW: 'Low Risk', MEDIUM: 'Moderate', HIGH: 'High Risk', CRITICAL: 'Critical',
};

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Pending: 'time-outline', Active: 'flash-outline', Completed: 'checkmark-circle-outline',
};

const STATUS_COLOR: Record<string, string> = {
  Pending: '#d97706', Active: '#2563eb', Completed: '#16a34a',
};

const DATE_FILTERS: Array<{ key: DateFilter; label: string }> = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
];

const SEV_FILTERS: Array<{ key: SeverityFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'LOW', label: 'Low' },
  { key: 'MEDIUM', label: 'Med' },
  { key: 'HIGH', label: 'High' },
  { key: 'CRITICAL', label: 'Critical' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByDate(entries: HealthTimelineEntry[], filter: DateFilter): HealthTimelineEntry[] {
  if (filter === 'all') return entries;
  const days = filter === '7d' ? 7 : filter === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * 86400000;
  return entries.filter((e) => new Date(normalizeDate(e.createdAt)).getTime() >= cutoff);
}

function detectRecurring(allEntries: HealthTimelineEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const e of allEntries) {
    const key = (e.condition || e.title).toLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const recurring = new Set<string>();
  counts.forEach((count, key) => { if (count >= 2) recurring.add(key); });
  return recurring;
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
}

function formatDate(iso: string) {
  try {
    return new Date(normalizeDate(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function shortDate(iso: string) {
  try {
    return new Date(normalizeDate(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatMonth(iso: string) {
  try {
    return new Date(normalizeDate(iso)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function groupByMonth(entries: HealthTimelineEntry[]) {
  const groups: { month: string; items: HealthTimelineEntry[] }[] = [];
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = formatMonth(entry.createdAt);
    if (seen.has(key)) {
      groups[seen.get(key)!].items.push(entry);
    } else {
      seen.set(key, groups.length);
      groups.push({ month: key, items: [entry] });
    }
  }
  return groups;
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  dateFilter, severityFilter, abnormalOnly,
  onDateChange, onSeverityChange, onAbnormalToggle,
}: {
  dateFilter: DateFilter; severityFilter: SeverityFilter; abnormalOnly: boolean;
  onDateChange: (f: DateFilter) => void; onSeverityChange: (f: SeverityFilter) => void; onAbnormalToggle: () => void;
}) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 }}>
      {/* Date range */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Date Range</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DATE_FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => onDateChange(f.key)} style={{ flex: 1, paddingVertical: 6, borderRadius: 10, alignItems: 'center', backgroundColor: dateFilter === f.key ? '#0AADA2' : '#f3f4f6' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: dateFilter === f.key ? '#fff' : '#6b7280' }}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Severity */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Severity</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SEV_FILTERS.map((f) => {
            const active = severityFilter === f.key;
            const c = f.key !== 'ALL' ? URGENCY[f.key as keyof typeof URGENCY]?.dot ?? '#0AADA2' : '#0AADA2';
            return (
              <Pressable key={f.key} onPress={() => onSeverityChange(f.key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 10, gap: 4, backgroundColor: active ? c + '18' : '#f9fafb', borderWidth: 1, borderColor: active ? c : 'transparent' }}>
                {f.key !== 'ALL' && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c }} />}
                <Text style={{ fontSize: 10, fontWeight: '700', color: active ? c : '#6b7280' }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Abnormal toggle */}
      <Pressable onPress={onAbnormalToggle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: abnormalOnly ? '#fef2f2' : '#f9fafb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: abnormalOnly ? '#fecaca' : 'transparent' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={15} color={abnormalOnly ? '#dc2626' : '#9ca3af'} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: abnormalOnly ? '#dc2626' : '#6b7280' }}>Abnormal only (High + Critical)</Text>
        </View>
        <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: abnormalOnly ? '#dc2626' : '#d1d5db', justifyContent: 'center', paddingHorizontal: 2 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: abnormalOnly ? 'flex-end' : 'flex-start' }} />
        </View>
      </Pressable>
    </View>
  );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

function TimelineItem({
  entry,
  isRecurring,
  isLast,
}: {
  entry: HealthTimelineEntry;
  isRecurring: boolean;
  isLast: boolean;
}) {
  const u = URGENCY[entry.urgency as keyof typeof URGENCY] ?? URGENCY.MEDIUM;
  const isAbnormal = entry.urgency === 'HIGH' || entry.urgency === 'CRITICAL';

  return (
    <Pressable onPress={() => router.push(`/(tab)/diagnosis/${entry.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 }}>
        {/* Spine */}
        <View style={{ alignItems: 'center', width: 28, marginRight: 12 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: u.dot, marginTop: 14, zIndex: 1 }} />
          {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: '#e5e7eb', marginTop: 2 }} />}
        </View>

        {/* Card */}
        <View style={{ flex: 1, backgroundColor: u.bg, borderRadius: 12, borderWidth: 1, borderColor: u.border, padding: 12, marginBottom: 10 }}>
          {/* Title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 }} numberOfLines={1}>
              {entry.title || entry.condition}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: (STATUS_COLOR[entry.status] ?? '#9ca3af') + '55' }}>
              <Ionicons name={STATUS_ICON[entry.status] ?? 'help-circle-outline'} size={11} color={STATUS_COLOR[entry.status]} />
              <Text style={{ fontSize: 10, color: STATUS_COLOR[entry.status], marginLeft: 3, fontWeight: '600' }}>{entry.status}</Text>
            </View>
          </View>

          {/* Condition + urgency */}
          <Text style={{ fontSize: 12, color: u.color, fontWeight: '600', marginBottom: 4 }}>
            {entry.condition}  ·  {u.label}
          </Text>

          {/* Description */}
          {!!entry.description && (
            <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 17, marginBottom: 6 }} numberOfLines={2}>
              {entry.description}
            </Text>
          )}

          {/* Tags row */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(entry.createdAt)}</Text>
            {isAbnormal && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fef2f2', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#fecaca' }}>
                <Ionicons name="warning" size={9} color="#dc2626" />
                <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700' }}>Abnormal</Text>
              </View>
            )}
            {isRecurring && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fffbeb', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#fde68a' }}>
                <Ionicons name="refresh-circle" size={9} color="#d97706" />
                <Text style={{ fontSize: 10, color: '#d97706', fontWeight: '700' }}>Recurring</Text>
              </View>
            )}
            {entry.escalated && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#faf5ff', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#ddd6fe' }}>
                <Ionicons name="arrow-up-circle" size={9} color="#7c3aed" />
                <Text style={{ fontSize: 10, color: '#7c3aed', fontWeight: '700' }}>Escalated</Text>
              </View>
            )}
            {entry.confidence > 0 && (
              <Text style={{ fontSize: 10, color: '#9ca3af', alignSelf: 'center' }}>{entry.confidence}% AI conf.</Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MonthGroup({
  month, items, recurringSet,
}: {
  month: string; items: HealthTimelineEntry[]; recurringSet: Set<string>;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10, marginTop: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>{month}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#f3f4f6', marginLeft: 10 }} />
        <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{items.length} case{items.length !== 1 ? 's' : ''}</Text>
      </View>
      {items.map((entry, idx) => (
        <TimelineItem
          key={entry.id}
          entry={entry}
          isRecurring={recurringSet.has((entry.condition || entry.title).toLowerCase().trim())}
          isLast={idx === items.length - 1}
        />
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HealthTimelineScreen() {
  const balance = usePaymentStore((s) => s.balance);
  const { patientTimeline, timelineLoading, timelineError, fetchPatientTimeline, unreadAlertCount, reset: resetHealthStore } = useHealthStore();
  const { user, sessionLoading } = useAuthStore();

  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [abnormalOnly, setAbnormalOnly] = useState(false);

  // Track the last userId that triggered a fetch. When a different user
  // becomes active, drop stale data immediately so the previous user's
  // records never flash in the new user's view.
  const fetchedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && user?.id) {
      if (fetchedForUserId.current !== user.id) {
        resetHealthStore();
      }
      fetchedForUserId.current = user.id;
      fetchPatientTimeline();
    }
    if (!user?.id) {
      fetchedForUserId.current = null;
    }
  }, [sessionLoading, user?.id]);

  // Re-fetch on return-to-focus so physician edits are visible immediately,
  // but skipped when data is less than 60 seconds old.
  const lastTimelineFetchAt = useHealthStore((s) => s.lastTimelineFetchAt);
  const STALE_MS = 60_000;
  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading && user?.id && fetchedForUserId.current === user.id) {
        const now = Date.now();
        if (!lastTimelineFetchAt || now - lastTimelineFetchAt >= STALE_MS) {
          fetchPatientTimeline();
        }
      }
    }, [sessionLoading, user?.id, fetchPatientTimeline, lastTimelineFetchAt]),
  );

  const onRefresh = useCallback(async () => { await fetchPatientTimeline(); }, [fetchPatientTimeline]);

  // Recurring set from full dataset
  const recurringSet = useMemo(() => detectRecurring(patientTimeline), [patientTimeline]);

  // Date-filtered base (used for chart + stats)
  const dateFiltered = useMemo(() => filterByDate(patientTimeline, dateFilter), [patientTimeline, dateFilter]);

  // Fully-filtered list
  const listEntries = useMemo(() => {
    let r = dateFiltered;
    if (severityFilter !== 'ALL') r = r.filter((e) => e.urgency === severityFilter);
    if (abnormalOnly) r = r.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL');
    return r;
  }, [dateFiltered, severityFilter, abnormalOnly]);

  const abnormalCount = useMemo(
    () => dateFiltered.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL').length,
    [dateFiltered]
  );

  const recurringCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const e of dateFiltered) {
      const key = (e.condition || e.title).toLowerCase().trim();
      if (recurringSet.has(key) && !seen.has(key)) { seen.add(key); count++; }
    }
    return count;
  }, [dateFiltered, recurringSet]);

  const groups = useMemo(() => groupByMonth(listEntries), [listEntries]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tab)/health' as never)}
          style={{ padding: 6, marginRight: 8, borderRadius: 20, backgroundColor: '#f3f4f6' }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Health Timeline</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
            Symptom history · severity trends
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tab)/health/report' as never)} style={{ padding: 6, borderRadius: 20, backgroundColor: '#f3f4f6' }} hitSlop={8}>
          <Ionicons name="document-text-outline" size={22} color="#374151" />
        </Pressable>
      </View>

      {/* Loading */}
      {timelineLoading && patientTimeline.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading health history…</Text>
        </View>
      )}

      {/* Error */}
      {!timelineLoading && !!timelineError && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="#9ca3af" />
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151' }}>Could not load timeline</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>{timelineError}</Text>
          <Pressable onPress={fetchPatientTimeline} style={{ marginTop: 16, backgroundColor: '#0AADA2', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty state */}
      {!timelineLoading && !timelineError && patientTimeline.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="medical-outline" size={32} color="#0AADA2" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>No health records yet</Text>
          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
            Your diagnosis history will appear here after your first consultation.
          </Text>
          <Pressable onPress={() => router.push('/(tab)/chatScreen' as never)} style={{ marginTop: 20, backgroundColor: '#0AADA2', paddingHorizontal: 28, paddingVertical: 11, borderRadius: 24 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Start a Consultation</Text>
          </Pressable>
        </View>
      )}

      {/* Main content */}
      {!timelineLoading && !timelineError && patientTimeline.length > 0 && (
        <SectionList
          sections={groups.map((g) => ({ title: g.month, data: g.items }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={timelineLoading} onRefresh={onRefresh} tintColor="#0AADA2" />}
          renderSectionHeader={({ section }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10, marginTop: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>{section.title}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#f3f4f6', marginLeft: 10 }} />
              <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{section.data.length} case{section.data.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <TimelineItem
              entry={item}
              isRecurring={recurringSet.has((item.condition || item.title).toLowerCase().trim())}
              isLast={index === section.data.length - 1}
            />
          )}
          ListHeaderComponent={
            <View>
              {/* Summary strip — Resolved / Abnormal / Recurring */}
              <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }}>
                {[
                  { label: 'Resolved', value: patientTimeline.filter((e) => e.status === 'Completed').length, color: '#16a34a' },
                  { label: 'Abnormal', value: abnormalCount, color: '#dc2626' },
                  { label: 'Recurring', value: recurringCount, color: '#d97706' },
                ].map((s, i, arr) => (
                  <View key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: '#f3f4f6' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: s.color }}>{s.value}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontWeight: '500' }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Severity chart */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>Severity Trend</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Last {Math.min(dateFiltered.length, 15)} sessions</Text>
                </View>
                <SeverityLineChart entries={dateFiltered} style={{ marginHorizontal: 16 }} />
              </View>

              {/* Filters */}
              <FilterBar
                dateFilter={dateFilter}
                severityFilter={severityFilter}
                abnormalOnly={abnormalOnly}
                onDateChange={setDateFilter}
                onSeverityChange={setSeverityFilter}
                onAbnormalToggle={() => setAbnormalOnly((p) => !p)}
              />

              {/* Empty filter state */}
              {listEntries.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 36, marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
                  <Ionicons name="search-outline" size={32} color="#d1d5db" />
                  <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '600', color: '#374151' }}>No records match</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 24 }}>
                    Try adjusting the date range or severity filter.
                  </Text>
                </View>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
    {!balance?.isPremium && <BannerAd />}
    <PatientBottomTabBar activeTab="health" />
    </View>
  );
}
