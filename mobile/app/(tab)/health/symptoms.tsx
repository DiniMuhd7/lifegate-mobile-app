import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgText,
  Rect,
} from 'react-native-svg';
import { useHealthStore } from 'stores/health-store';
import type { HealthTimelineEntry } from 'types/health-types';

// ─── Constants ────────────────────────────────────────────────────────────────

type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type DateFilter = '7d' | '30d' | '90d' | 'all';
type SeverityFilter = 'ALL' | Urgency;

const URGENCY_RANK: Record<Urgency, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const URGENCY_COLOR: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
  CRITICAL: '#a855f7',
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

const URGENCY_LABEL: Record<string, string> = {
  LOW: 'Low Risk',
  MEDIUM: 'Moderate',
  HIGH: 'High Risk',
  CRITICAL: 'Critical',
};

const STATUS_COLOR: Record<string, string> = {
  Pending: '#d97706',
  Active: '#2563eb',
  Completed: '#16a34a',
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
  return entries.filter((e) => new Date(e.createdAt).getTime() >= cutoff);
}

function detectRecurring(allEntries: HealthTimelineEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const e of allEntries) {
    const key = (e.condition || e.title).toLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const recurring = new Set<string>();
  counts.forEach((count, key) => {
    if (count >= 2) recurring.add(key);
  });
  return recurring;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Severity Line Chart ──────────────────────────────────────────────────────

function SeverityLineChart({ entries }: { entries: HealthTimelineEntry[] }) {
  const { width: screenW } = useWindowDimensions();

  // Oldest → newest, max 15 points
  const chartData = useMemo(
    () => [...entries].reverse().slice(-15),
    [entries]
  );

  if (chartData.length < 2) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          height: 80,
          borderRadius: 14,
          backgroundColor: '#f9fafb',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>
          Need at least 2 records to show chart
        </Text>
      </View>
    );
  }

  const PAD_LEFT = 42;
  const PAD_RIGHT = 12;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 28;
  const svgW = screenW - 32;
  const svgH = 160;
  const chartW = svgW - PAD_LEFT - PAD_RIGHT;
  const chartH = svgH - PAD_TOP - PAD_BOTTOM;

  const step = chartW / (chartData.length - 1);

  const points = chartData.map((e, i) => {
    const rank = URGENCY_RANK[e.urgency as Urgency] ?? 1;
    return {
      x: PAD_LEFT + i * step,
      y: PAD_TOP + chartH - (rank / 4) * chartH,
      color: URGENCY_COLOR[e.urgency] ?? URGENCY_COLOR.LOW,
      entry: e,
    };
  });

  // Area fill path (encloses under the line)
  const areaPath = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
    `L ${points[0].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
    'Z',
  ].join(' ');

  // Y grid lines + labels
  const yLevels = [
    { rank: 4, label: 'CRIT', color: URGENCY_COLOR.CRITICAL },
    { rank: 3, label: 'HIGH', color: URGENCY_COLOR.HIGH },
    { rank: 2, label: 'MED', color: URGENCY_COLOR.MEDIUM },
    { rank: 1, label: 'LOW', color: URGENCY_COLOR.LOW },
  ].map((l) => ({
    ...l,
    y: PAD_TOP + chartH - (l.rank / 4) * chartH,
  }));

  // X axis: show first, middle, last date labels
  const xLabels = [0, Math.floor((chartData.length - 1) / 2), chartData.length - 1]
    .filter((i, pos, arr) => arr.indexOf(i) === pos)
    .map((i) => ({ x: PAD_LEFT + i * step, label: shortDate(chartData[i].createdAt) }));

  return (
    <View
      style={{
        marginHorizontal: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        paddingVertical: 4,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <Svg width={svgW} height={svgH}>
        {/* Grid lines */}
        {yLevels.map((l) => (
          <Line
            key={`grid-${l.label}`}
            x1={PAD_LEFT}
            y1={l.y}
            x2={PAD_LEFT + chartW}
            y2={l.y}
            stroke="#f3f4f6"
            strokeWidth={1}
          />
        ))}

        {/* Y axis labels */}
        {yLevels.map((l) => (
          <SvgText
            key={`ylabel-${l.label}`}
            x={PAD_LEFT - 5}
            y={l.y + 4}
            fontSize={9}
            fill={l.color}
            textAnchor="end"
            fontWeight="700"
          >
            {l.label}
          </SvgText>
        ))}

        {/* Filled area under line */}
        <Path d={areaPath} fill="rgba(10,173,162,0.07)" />

        {/* Colored line segments */}
        {points.slice(1).map((p, i) => (
          <Line
            key={`seg-${i}`}
            x1={points[i].x}
            y1={points[i].y}
            x2={p.x}
            y2={p.y}
            stroke={p.color}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}

        {/* Dots per urgency */}
        {points.map((p, i) => (
          <React.Fragment key={`dot-${i}`}>
            <Circle cx={p.x} cy={p.y} r={7} fill={p.color + '22'} />
            <Circle cx={p.x} cy={p.y} r={4} fill={p.color} stroke="#fff" strokeWidth={1.5} />
          </React.Fragment>
        ))}

        {/* X axis date labels */}
        {xLabels.map((l, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={l.x}
            y={svgH - 6}
            fontSize={9}
            fill="#9ca3af"
            textAnchor="middle"
          >
            {l.label}
          </SvgText>
        ))}
      </Svg>

      {/* Chart legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 10, paddingTop: 2 }}>
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Urgency[]).map((u) => (
          <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: URGENCY_COLOR[u] }}
            />
            <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '500' }}>
              {URGENCY_LABEL[u]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({
  total,
  abnormal,
  recurring,
}: {
  total: number;
  abnormal: number;
  recurring: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#f3f4f6',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {[
        { label: 'Recorded', value: total, color: '#0891b2' },
        { label: 'Abnormal', value: abnormal, color: '#dc2626' },
        { label: 'Recurring', value: recurring, color: '#d97706' },
      ].map((s, i, arr) => (
        <View
          key={s.label}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 14,
            borderRightWidth: i < arr.length - 1 ? 1 : 0,
            borderRightColor: '#f3f4f6',
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: s.color }}>{s.value}</Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontWeight: '500' }}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  dateFilter,
  severityFilter,
  abnormalOnly,
  onDateChange,
  onSeverityChange,
  onAbnormalToggle,
}: {
  dateFilter: DateFilter;
  severityFilter: SeverityFilter;
  abnormalOnly: boolean;
  onDateChange: (f: DateFilter) => void;
  onSeverityChange: (f: SeverityFilter) => void;
  onAbnormalToggle: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        padding: 12,
        gap: 10,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      {/* Date range */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
          Date Range
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DATE_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => onDateChange(f.key)}
              style={{
                flex: 1,
                paddingVertical: 6,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: dateFilter === f.key ? '#0AADA2' : '#f3f4f6',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: dateFilter === f.key ? '#fff' : '#6b7280',
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Severity filter */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
          Severity
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SEV_FILTERS.map((f) => {
            const isActive = severityFilter === f.key;
            const dotColor = f.key !== 'ALL' ? URGENCY_COLOR[f.key] : '#0AADA2';
            return (
              <Pressable
                key={f.key}
                onPress={() => onSeverityChange(f.key)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 6,
                  borderRadius: 10,
                  gap: 4,
                  backgroundColor: isActive ? dotColor + '18' : '#f9fafb',
                  borderWidth: 1,
                  borderColor: isActive ? dotColor : 'transparent',
                }}
              >
                {f.key !== 'ALL' && (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: dotColor,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: isActive ? dotColor : '#6b7280',
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Abnormal only toggle */}
      <Pressable
        onPress={onAbnormalToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: abnormalOnly ? '#fef2f2' : '#f9fafb',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderWidth: 1,
          borderColor: abnormalOnly ? '#fecaca' : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons
            name="warning-outline"
            size={15}
            color={abnormalOnly ? '#dc2626' : '#9ca3af'}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: abnormalOnly ? '#dc2626' : '#6b7280',
            }}
          >
            Abnormal only (High + Critical)
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            backgroundColor: abnormalOnly ? '#dc2626' : '#d1d5db',
            justifyContent: 'center',
            paddingHorizontal: 2,
          }}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: '#fff',
              alignSelf: abnormalOnly ? 'flex-end' : 'flex-start',
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}

// ─── Symptom Card ─────────────────────────────────────────────────────────────

function SymptomCard({
  entry,
  isRecurring,
}: {
  entry: HealthTimelineEntry;
  isRecurring: boolean;
}) {
  const isAbnormal = entry.urgency === 'HIGH' || entry.urgency === 'CRITICAL';
  const color = URGENCY_COLOR[entry.urgency] ?? '#6b7280';
  const bg = URGENCY_BG[entry.urgency] ?? '#f9fafb';
  const border = URGENCY_BORDER[entry.urgency] ?? '#e5e7eb';

  return (
    <Pressable
      onPress={() => router.push(`/(tab)/diagnosis/${entry.id}` as never)}
      style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
    >
      <View
        style={{
          backgroundColor: bg,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: border,
          padding: 13,
          marginBottom: 8,
        }}
      >
        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
          {/* Urgency dot */}
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: color,
              marginTop: 3,
              marginRight: 10,
              flexShrink: 0,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
              {entry.condition || entry.title}
            </Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {formatDate(entry.createdAt)}
            </Text>
          </View>

          {/* Urgency pill */}
          <View
            style={{
              backgroundColor: color + '18',
              borderRadius: 20,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: color + '44',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color }}>
              {URGENCY_LABEL[entry.urgency]}
            </Text>
          </View>
        </View>

        {/* Description preview */}
        {!!entry.description && (
          <Text
            style={{
              fontSize: 12,
              color: '#6b7280',
              lineHeight: 17,
              marginLeft: 20,
              marginBottom: 8,
            }}
            numberOfLines={2}
          >
            {entry.description}
          </Text>
        )}

        {/* Tags row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 20 }}>
          {/* Status */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              backgroundColor: '#fff',
              borderRadius: 20,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: (STATUS_COLOR[entry.status] ?? '#9ca3af') + '44',
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: STATUS_COLOR[entry.status] ?? '#9ca3af',
              }}
            />
            <Text
              style={{
                fontSize: 10,
                color: STATUS_COLOR[entry.status] ?? '#9ca3af',
                fontWeight: '600',
              }}
            >
              {entry.status}
            </Text>
          </View>

          {/* Abnormal tag */}
          {isAbnormal && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: '#fef2f2',
                borderRadius: 20,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: '#fecaca',
              }}
            >
              <Ionicons name="warning" size={9} color="#dc2626" />
              <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700' }}>Abnormal</Text>
            </View>
          )}

          {/* Recurring tag */}
          {isRecurring && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: '#fffbeb',
                borderRadius: 20,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: '#fde68a',
              }}
            >
              <Ionicons name="refresh-circle" size={9} color="#d97706" />
              <Text style={{ fontSize: 10, color: '#d97706', fontWeight: '700' }}>Recurring</Text>
            </View>
          )}

          {/* Escalated tag */}
          {entry.escalated && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: '#faf5ff',
                borderRadius: 20,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: '#ddd6fe',
              }}
            >
              <Ionicons name="arrow-up-circle" size={9} color="#7c3aed" />
              <Text style={{ fontSize: 10, color: '#7c3aed', fontWeight: '700' }}>Escalated</Text>
            </View>
          )}

          {/* Confidence */}
          {entry.confidence > 0 && (
            <Text style={{ fontSize: 10, color: '#9ca3af', alignSelf: 'center' }}>
              {entry.confidence}% AI confidence
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SymptomTrackerScreen() {
  const { patientTimeline, timelineLoading, fetchPatientTimeline } = useHealthStore();

  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [abnormalOnly, setAbnormalOnly] = useState(false);

  useEffect(() => {
    fetchPatientTimeline();
  }, []);

  const onRefresh = useCallback(async () => {
    await fetchPatientTimeline();
  }, [fetchPatientTimeline]);

  // Recurring condition set (based on full dataset)
  const recurringSet = useMemo(() => detectRecurring(patientTimeline), [patientTimeline]);

  // Date-filtered entries → used for both the chart and list base
  const dateFiltered = useMemo(
    () => filterByDate(patientTimeline, dateFilter),
    [patientTimeline, dateFilter]
  );

  // Fully filtered for the list
  const listEntries = useMemo(() => {
    let result = dateFiltered;
    if (severityFilter !== 'ALL') {
      result = result.filter((e) => e.urgency === severityFilter);
    }
    if (abnormalOnly) {
      result = result.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL');
    }
    return result;
  }, [dateFiltered, severityFilter, abnormalOnly]);

  // Summary stats (from the date-filtered window)
  const abnormalCount = useMemo(
    () => dateFiltered.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL').length,
    [dateFiltered]
  );

  const recurringCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const e of dateFiltered) {
      const key = (e.condition || e.title).toLowerCase().trim();
      if (recurringSet.has(key) && !seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
    return count;
  }, [dateFiltered, recurringSet]);

  const isLoading = timelineLoading && patientTimeline.length === 0;

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
          style={{
            padding: 6,
            marginRight: 10,
            borderRadius: 20,
            backgroundColor: '#f3f4f6',
          }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
            Symptom Tracker
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
            Severity history & trend analysis
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tab)/chatScreen' as never)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: '#0AADA2',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}
        >
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Report</Text>
        </Pressable>
      </View>

      {/* Loading */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
            Loading symptom history…
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
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
          <SummaryStrip
            total={dateFiltered.length}
            abnormal={abnormalCount}
            recurring={recurringCount}
          />

          {/* Severity chart */}
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginHorizontal: 16,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                Severity Trend
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                Last {Math.min(dateFiltered.length, 15)} sessions
              </Text>
            </View>
            <SeverityLineChart entries={dateFiltered} />
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

          {/* Timeline list */}
          <View style={{ marginHorizontal: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                Symptom Log
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                {listEntries.length} record{listEntries.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {listEntries.length === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: 36,
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#f3f4f6',
                }}
              >
                <Ionicons name="search-outline" size={32} color="#d1d5db" />
                <Text
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#374151',
                  }}
                >
                  No records match
                </Text>
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: '#9ca3af',
                    textAlign: 'center',
                    paddingHorizontal: 24,
                  }}
                >
                  Try adjusting the date range or severity filter.
                </Text>
              </View>
            ) : (
              listEntries.map((entry) => {
                const key = (entry.condition || entry.title).toLowerCase().trim();
                return (
                  <SymptomCard
                    key={entry.id}
                    entry={entry}
                    isRecurring={recurringSet.has(key)}
                  />
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
