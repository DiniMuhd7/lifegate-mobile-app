import React, { useEffect, useCallback } from 'react';
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
import { useHealthStore } from 'stores/health-store';
import type { HealthTimelineEntry } from 'types/health-types';

// ─── Config maps ─────────────────────────────────────────────────────────────

const URGENCY = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: 'Low Risk'  },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Moderate'  },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'High Risk' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', dot: '#a855f7', label: 'Critical'  },
} as const;

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Pending:   'time-outline',
  Active:    'flash-outline',
  Completed: 'checkmark-circle-outline',
};

const STATUS_COLOR: Record<string, string> = {
  Pending:   '#d97706',
  Active:    '#2563eb',
  Completed: '#16a34a',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatMonth(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineItem({ entry }: { entry: HealthTimelineEntry }) {
  const u = URGENCY[entry.urgency as keyof typeof URGENCY] ?? URGENCY.MEDIUM;

  return (
    <Pressable
      onPress={() => router.push(`/(tab)/diagnosis/${entry.id}` as never)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 }}>
        {/* Timeline spine + dot */}
        <View style={{ alignItems: 'center', width: 28, marginRight: 12 }}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: u.dot,
              marginTop: 14,
              zIndex: 1,
            }}
          />
          <View style={{ flex: 1, width: 2, backgroundColor: '#e5e7eb', marginTop: 2 }} />
        </View>

        {/* Card */}
        <View
          style={{
            flex: 1,
            backgroundColor: u.bg,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: u.border,
            padding: 12,
            marginBottom: 10,
          }}
        >
          {/* Title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text
              style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 }}
              numberOfLines={1}
            >
              {entry.title || entry.condition}
            </Text>
            {/* Status badge */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: STATUS_COLOR[entry.status] + '55',
              }}
            >
              <Ionicons
                name={STATUS_ICON[entry.status] ?? 'help-circle-outline'}
                size={11}
                color={STATUS_COLOR[entry.status]}
              />
              <Text style={{ fontSize: 10, color: STATUS_COLOR[entry.status], marginLeft: 3, fontWeight: '600' }}>
                {entry.status}
              </Text>
            </View>
          </View>

          {/* Condition + urgency */}
          <Text style={{ fontSize: 12, color: u.color, fontWeight: '600', marginBottom: 4 }}>
            {entry.condition}  ·  {u.label}
          </Text>

          {/* Description preview */}
          {!!entry.description && (
            <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 17 }} numberOfLines={2}>
              {entry.description}
            </Text>
          )}

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(entry.createdAt)}</Text>
            {entry.escalated && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="arrow-up-circle" size={12} color="#7c3aed" />
                <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>Escalated</Text>
              </View>
            )}
            {entry.confidence > 0 && (
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>{entry.confidence}% confidence</Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MonthGroup({ month, items }: { month: string; items: HealthTimelineEntry[] }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10, marginTop: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
          {month}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#f3f4f6', marginLeft: 10 }} />
        <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{items.length} case{items.length !== 1 ? 's' : ''}</Text>
      </View>
      {items.map((entry) => (
        <TimelineItem key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HealthTimelineScreen() {
  const {
    patientTimeline,
    timelineLoading,
    timelineError,
    fetchPatientTimeline,
    unreadAlertCount,
  } = useHealthStore();

  useEffect(() => {
    fetchPatientTimeline();
  }, []);

  const onRefresh = useCallback(async () => {
    await fetchPatientTimeline();
  }, [fetchPatientTimeline]);

  const groups = groupByMonth(patientTimeline);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Header */}
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
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 6, marginRight: 8, borderRadius: 20, backgroundColor: '#f3f4f6' }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Health Timeline</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
            {patientTimeline.length} record{patientTimeline.length !== 1 ? 's' : ''} · chronological
          </Text>
        </View>
        {/* Alerts shortcut with badge */}
        <Pressable
          onPress={() => router.push('/(tab)/health/alerts' as never)}
          style={{ padding: 6, borderRadius: 20, backgroundColor: '#f3f4f6', position: 'relative' }}
          hitSlop={8}
        >
          <Ionicons name="notifications-outline" size={22} color="#374151" />
          {unreadAlertCount > 0 && (
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
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </Text>
            </View>
          )}
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
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151' }}>
            Could not load timeline
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            {timelineError}
          </Text>
          <Pressable
            onPress={fetchPatientTimeline}
            style={{
              marginTop: 16,
              backgroundColor: '#0AADA2',
              paddingHorizontal: 24,
              paddingVertical: 10,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty state */}
      {!timelineLoading && !timelineError && patientTimeline.length === 0 && (
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
            <Ionicons name="medical-outline" size={32} color="#0AADA2" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
            No health records yet
          </Text>
          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
            Your diagnosis history will appear here after your first consultation.
          </Text>
          <Pressable
            onPress={() => router.push('/(tab)/chatScreen' as never)}
            style={{
              marginTop: 20,
              backgroundColor: '#0AADA2',
              paddingHorizontal: 28,
              paddingVertical: 11,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Start a Consultation</Text>
          </Pressable>
        </View>
      )}

      {/* Timeline list */}
      {patientTimeline.length > 0 && (
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={timelineLoading}
              onRefresh={onRefresh}
              tintColor="#0AADA2"
            />
          }
        >
          {/* Summary strip */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              marginHorizontal: 16,
              marginBottom: 16,
              marginTop: 8,
              backgroundColor: '#fff',
              borderRadius: 14,
              padding: 14,
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            {(['Completed', 'Active', 'Pending'] as const).map((s) => {
              const count = patientTimeline.filter((e) => e.status === s).length;
              return (
                <View key={s} style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: STATUS_COLOR[s] }}>
                    {count}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{s}</Text>
                </View>
              );
            })}
          </View>

          {groups.map((g) => (
            <MonthGroup key={g.month} month={g.month} items={g.items} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
