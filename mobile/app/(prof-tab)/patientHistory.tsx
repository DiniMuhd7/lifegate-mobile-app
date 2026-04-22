import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from 'stores/health-store';
import type { HealthTimelineEntry } from 'types/health-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const URGENCY = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: 'Low' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Moderate' },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'High' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', dot: '#a855f7', label: 'Critical' },
} as const;

const STATUS_COLOR: Record<string, string> = {
  Pending:   '#d97706',
  Active:    '#2563eb',
  Completed: '#16a34a',
};

type FilterStatus = 'All' | 'Pending' | 'Active' | 'Completed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return '—';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── PatientCaseCard ──────────────────────────────────────────────────────────

function PatientCaseCard({ entry }: { entry: HealthTimelineEntry }) {
  const u = URGENCY[entry.urgency as keyof typeof URGENCY] ?? URGENCY.MEDIUM;

  const handlePress = () => {
    router.push({ pathname: '/(prof-tab)/caseReview', params: { caseId: entry.id } } as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        marginHorizontal: 16,
        marginBottom: 10,
      })}
    >
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#f3f4f6',
          padding: 14,
          shadowColor: '#000',
          shadowOpacity: 0.03,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        {/* Patient name + date */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Avatar placeholder */}
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: '#f0fdfa',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#0AADA2' }}>
                {(entry.patientName ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                {entry.patientName ?? 'Unknown Patient'}
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(entry.createdAt)}</Text>
            </View>
          </View>
          {/* Status badge */}
          <View
            style={{
              backgroundColor: STATUS_COLOR[entry.status] + '18',
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 11, color: STATUS_COLOR[entry.status], fontWeight: '700' }}>
              {entry.status}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 4 }} numberOfLines={1}>
          {entry.title || entry.condition}
        </Text>

        {/* Condition chip + urgency */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: u.bg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: u.border,
            }}
          >
            <Text style={{ fontSize: 11, color: u.color, fontWeight: '600' }}>
              {entry.condition}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: u.bg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 11, color: u.color, fontWeight: '600' }}>{u.label}</Text>
          </View>
          {entry.escalated && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="arrow-up-circle" size={13} color="#7c3aed" />
              <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>Escalated</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {!!entry.description && (
          <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 17 }} numberOfLines={2}>
            {entry.description}
          </Text>
        )}

        {/* Physician notes */}
        {!!entry.physicianNotes && (
          <View
            style={{
              backgroundColor: '#f0f9ff',
              borderRadius: 8,
              padding: 8,
              marginTop: 8,
              borderLeftWidth: 3,
              borderLeftColor: '#0ea5e9',
            }}
          >
            <Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '600', marginBottom: 2 }}>
              Physician Note
            </Text>
            <Text style={{ fontSize: 12, color: '#0369a1', lineHeight: 16 }} numberOfLines={3}>
              {entry.physicianNotes}
            </Text>
          </View>
        )}

        {/* Footer */}
        <Text style={{ fontSize: 11, color: '#d1d5db', marginTop: 8, textAlign: 'right' }}>
          {formatDate(entry.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PatientHistoryScreen() {
  const {
    physicianTimeline,
    physicianTimelineLoading,
    physicianTimelineError,
    fetchPhysicianTimeline,
    unreadPhysicianAlertCount,
  } = useHealthStore();

  const [filter, setFilter] = useState<FilterStatus>('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPhysicianTimeline();
  }, []);

  const onRefresh = useCallback(async () => {
    await fetchPhysicianTimeline();
  }, [fetchPhysicianTimeline]);

  const filtered = physicianTimeline.filter((e) => {
    const matchStatus = filter === 'All' || e.status === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      e.patientName?.toLowerCase().includes(q) ||
      e.condition.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const FILTERS: FilterStatus[] = ['All', 'Pending', 'Active', 'Completed'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ padding: 6, marginRight: 8, borderRadius: 20, backgroundColor: '#f3f4f6' }}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Patient History</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
              {physicianTimeline.length} case{physicianTimeline.length !== 1 ? 's' : ''} total
            </Text>
          </View>
          {/* Alert badge for physician */}
          <Pressable
            onPress={() => router.push('/(prof-tab)/notification' as never)}
            style={{ padding: 6, borderRadius: 20, backgroundColor: '#f3f4f6', position: 'relative' }}
            hitSlop={8}
          >
            <Ionicons name="notifications-outline" size={22} color="#374151" />
            {unreadPhysicianAlertCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: '#dc2626',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>
                  {unreadPhysicianAlertCount > 9 ? '9+' : unreadPhysicianAlertCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Search */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#f3f4f6',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 10,
          }}
        >
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' }}
            placeholder="Search patient, condition…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          )}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: filter === f ? '#0AADA2' : '#f3f4f6',
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: filter === f ? '#fff' : '#6b7280' }}
              >
                {f}
                {f !== 'All'
                  ? ` (${physicianTimeline.filter((e) => e.status === f).length})`
                  : ` (${physicianTimeline.length})`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Loading */}
      {physicianTimelineLoading && physicianTimeline.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading patient records…</Text>
        </View>
      )}

      {/* Error */}
      {!physicianTimelineLoading && !!physicianTimelineError && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="#9ca3af" />
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151' }}>
            Could not load history
          </Text>
          <Pressable
            onPress={fetchPhysicianTimeline}
            style={{ marginTop: 16, backgroundColor: '#0AADA2', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty state */}
      {!physicianTimelineLoading && !physicianTimelineError && filtered.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#f0fdfa',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name="folder-open-outline" size={34} color="#0AADA2" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
            {search || filter !== 'All' ? 'No matching records' : 'No patient records yet'}
          </Text>
          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
            {search || filter !== 'All'
              ? 'Try adjusting the search or filter.'
              : 'Patient cases will appear here as they come in.'}
          </Text>
        </View>
      )}

      {/* List */}
      {filtered.length > 0 && (
        <FlatList
          data={filtered}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <PatientCaseCard entry={item} />}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={physicianTimelineLoading}
              onRefresh={onRefresh}
              tintColor="#0AADA2"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
