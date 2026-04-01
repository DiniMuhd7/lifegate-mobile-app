import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfessionalStore } from '../../stores/professional-store';
import { EarningRecord, CaseUrgency } from '../../types/professional-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const URGENCY_COLORS: Record<CaseUrgency, string> = {
  LOW:      '#22c55e',
  MEDIUM:   '#f59e0b',
  HIGH:     '#f97316',
  CRITICAL: '#ef4444',
};

const URGENCY_BG: Record<CaseUrgency, string> = {
  LOW:      '#dcfce7',
  MEDIUM:   '#fef9c3',
  HIGH:     '#ffedd5',
  CRITICAL: '#fee2e2',
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef9c3', text: '#854d0e' },
  paid:    { bg: '#dcfce7', text: '#166534' },
};

// ─── Row component ────────────────────────────────────────────────────────────

function EarningRow({ item }: { item: EarningRecord }) {
  const u = (item.urgency as CaseUrgency) || 'LOW';
  const status = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending;

  return (
    <View
      className="bg-white rounded-2xl mx-4 mb-3 p-4"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}
    >
      {/* Top row */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
            {item.patientName || 'Patient'}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {item.condition || 'Diagnosis'}
          </Text>
        </View>
        <Text className="text-base font-bold text-green-700">{formatNaira(item.amount)}</Text>
      </View>

      {/* Badges row */}
      <View className="flex-row items-center gap-2 flex-wrap">
        {/* Urgency */}
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: URGENCY_BG[u] }}
        >
          <Text className="text-xs font-bold" style={{ color: URGENCY_COLORS[u] }}>
            {u}
          </Text>
        </View>

        {/* Decision */}
        <View
          className="px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: item.decision === 'Approved' ? '#dcfce7' : '#fee2e2',
          }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: item.decision === 'Approved' ? '#166534' : '#991b1b' }}
          >
            {item.decision === 'Approved' ? '✓ Approved' : '✗ Rejected'}
          </Text>
        </View>

        {/* Earning status */}
        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: status.bg }}>
          <Text className="text-xs font-semibold capitalize" style={{ color: status.text }}>
            {item.status}
          </Text>
        </View>
      </View>

      {/* Date */}
      <Text className="text-xs text-gray-400 mt-2">{formatDate(item.casedAt)}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CaseHistoryScreen() {
  const router = useRouter();
  const {
    earningsHistory,
    earningsTotal,
    isEarningsLoading,
    earningsSummary,
    loadEarningsSummary,
    loadEarningsHistory,
  } = useProfessionalStore();

  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  const refresh = useCallback(async () => {
    setPage(1);
    await Promise.all([loadEarningsSummary(), loadEarningsHistory(1, PAGE_SIZE)]);
  }, [loadEarningsSummary, loadEarningsHistory]);

  useEffect(() => {
    refresh();
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || earningsHistory.length >= earningsTotal) return;
    const nextPage = page + 1;
    setIsLoadingMore(true);
    await loadEarningsHistory(nextPage, PAGE_SIZE);
    setPage(nextPage);
    setIsLoadingMore(false);
  }, [isLoadingMore, earningsHistory.length, earningsTotal, page, loadEarningsHistory]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1e3a5f', '#0f2440']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="px-4 pt-3 pb-5"
      >
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">Case History</Text>
            <Text className="text-white/60 text-xs mt-0.5">{earningsTotal} approved cases</Text>
          </View>
        </View>

        {/* Summary strip */}
        <View className="flex-row gap-4">
          <View className="flex-1 bg-white/10 rounded-xl p-3">
            <Text className="text-white/60 text-xs mb-0.5">Total Earned</Text>
            <Text className="text-white text-base font-bold">
              {`₦${(earningsSummary?.totalEarned ?? 0).toLocaleString('en-NG')}`}
            </Text>
          </View>
          <View className="flex-1 bg-white/10 rounded-xl p-3">
            <Text className="text-white/60 text-xs mb-0.5">Pending Payout</Text>
            <Text className="text-white text-base font-bold">
              {`₦${(earningsSummary?.pendingPayout ?? 0).toLocaleString('en-NG')}`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── List ────────────────────────────────────────────────────── */}
      <FlatList
        data={earningsHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EarningRow item={item} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={isEarningsLoading && page === 1}
            onRefresh={refresh}
            tintColor="#3b82f6"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          isEarningsLoading ? (
            <View className="flex-1 items-center justify-center py-20">
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : (
            <View className="items-center py-20 px-8">
              <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
              <Text className="text-gray-400 text-base font-semibold mt-3">No approved cases yet</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center">
                Earnings are credited when you approve a patient case from the Case Queue.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(prof-tab)/caseQueue')}
                className="mt-5 flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600"
              >
                <Ionicons name="medical-outline" size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">Go to Case Queue</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
