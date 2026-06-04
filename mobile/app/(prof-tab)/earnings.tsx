import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEarningsStore } from '../../stores/professional-store';
import { Payout } from '../../types/professional-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimum pending earnings (₦) before a payout request is unlocked. */
const MIN_PAYOUT_THRESHOLD = 5000;

/** Returns true only when today is the last calendar day of the month. */
function isLastDayOfMonth(): boolean {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/** Returns the last day of the current month as a formatted string, e.g. "31 May". */
function lastDayLabel(): string {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function nextPayoutLabel(dateStr: string) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const today = new Date();
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days (${formatDate(dateStr)})`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View className="flex-1 bg-white rounded-2xl p-4 mx-1" style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
      <View className="w-8 h-8 rounded-full items-center justify-center mb-2" style={{ backgroundColor: accent + '20' }}>
        <Ionicons name={icon as any} size={16} color={accent} />
      </View>
      <Text className="text-xs text-gray-500 mb-0.5">{label}</Text>
      <Text className="text-base font-bold text-gray-900">{value}</Text>
    </View>
  );
}

const PAYOUT_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: '#fef9c3', text: '#854d0e', label: 'Pending' },
  requested:  { bg: '#ede9fe', text: '#5b21b6', label: 'Requested' },
  processing: { bg: '#dbeafe', text: '#1e40af', label: 'Processing' },
  paid:       { bg: '#dcfce7', text: '#166534', label: 'Paid' },
  rejected:   { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
};

function PayoutRow({ item }: { item: Payout }) {
  const style = PAYOUT_STATUS_STYLE[item.status] ?? PAYOUT_STATUS_STYLE.pending;
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-800">
          {formatDate(item.periodStart)} → {formatDate(item.periodEnd)}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {item.caseCount} {item.caseCount === 1 ? 'case' : 'cases'}
          {item.paidAt ? `  ·  Paid ${formatDate(item.paidAt)}` : ''}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="text-sm font-bold text-gray-900">{formatNaira(item.totalAmount)}</Text>
        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg }}>
          <Text className="text-xs font-semibold" style={{ color: style.text }}>{style.label}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const router = useRouter();
  const {
    earningsSummary,
    payouts,
    isEarningsLoading,
    isRequestingPayout,
    loadEarningsSummary,
    loadPayouts,
    requestPayout,
  } = useEarningsStore();

  const refresh = useCallback(async () => {
    await Promise.all([loadEarningsSummary(), loadPayouts()]);
  }, [loadEarningsSummary, loadPayouts]);

  useEffect(() => {
    refresh();
  }, []);

  const handleRequestPayout = useCallback(async () => {
    const pending = earningsSummary?.pendingPayout ?? 0;
    const show = (title: string, msg: string) => {
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert(`${title}\n\n${msg}`);
      } else {
        Alert.alert(title, msg);
      }
    };
    if (pending < MIN_PAYOUT_THRESHOLD) {
      show(
        'Threshold Not Met',
        `You need at least ₦${MIN_PAYOUT_THRESHOLD.toLocaleString('en-NG')} in pending earnings to request a payout. You have ₦${pending.toLocaleString('en-NG')} so far.`,
      );
      return;
    }
    if (!isLastDayOfMonth()) {
      show(
        'Not Available Yet',
        `Payout requests open on the last day of the month (${lastDayLabel()}). Keep approving cases until then!`,
      );
      return;
    }
    const result = await requestPayout();
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert(result.message);
    } else {
      Alert.alert(result.success ? 'Payout Requested' : 'Error', result.message);
    }
  }, [earningsSummary, requestPayout]);

  if (isEarningsLoading && !earningsSummary) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3 text-sm">Loading earnings…</Text>
      </SafeAreaView>
    );
  }

  const s = earningsSummary;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1e3a5f', '#0f2440']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="px-4 pt-3 pb-6"
      >
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">Earnings & Performance</Text>
            <Text className="text-white/60 text-xs mt-0.5">
              ₦{s?.perCaseRate ?? 500} per approved case
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(prof-tab)/caseHistory')}
            className="flex-row items-center bg-white/10 rounded-full px-3 py-1.5"
          >
            <Ionicons name="list-outline" size={14} color="#fff" />
            <Text className="text-white text-xs ml-1 font-semibold">History</Text>
          </TouchableOpacity>
        </View>

        {/* Hero total */}
        <View className="items-center">
          <Text className="text-white/60 text-xs uppercase tracking-widest mb-1">Total Earned</Text>
          <Text className="text-white text-4xl font-bold">{formatNaira(s?.totalEarned ?? 0)}</Text>
          <Text className="text-white/50 text-xs mt-1">
            from {s?.casesCompleted ?? 0} approved {s?.casesCompleted === 1 ? 'case' : 'cases'}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isEarningsLoading} onRefresh={refresh} tintColor="#3b82f6" />
        }
      >
        {/* ── Summary cards ──────────────────────────────────────────── */}
        <View className="flex-row px-3 mb-3">
          <SummaryCard
            icon="time-outline"
            label="Pending Payout"
            value={formatNaira(s?.pendingPayout ?? 0)}
            accent="#f59e0b"
          />
          <SummaryCard
            icon="checkmark-done-outline"
            label="Paid Out"
            value={formatNaira(s?.paidOut ?? 0)}
            accent="#22c55e"
          />
        </View>
        <View className="flex-row px-3 mb-5">
          <SummaryCard
            icon="hourglass-outline"
            label="Awaiting Payout"
            value={`${s?.casesPending ?? 0} cases`}
            accent="#6366f1"
          />
          <SummaryCard
            icon="calendar-outline"
            label="Next Payout"
            value={nextPayoutLabel(s?.nextPayoutDate ?? '')}
            accent="#3b82f6"
          />
        </View>

        {/* ── Last payout callout ─────────────────────────────────────── */}
        {(s?.lastPayoutAmount ?? 0) > 0 && (
          <View className="mx-4 mb-5 bg-green-50 rounded-2xl p-4 flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center">
              <Ionicons name="cash-outline" size={20} color="#16a34a" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-green-800">Last Payout Received</Text>
              <Text className="text-xs text-green-600 mt-0.5">
                {formatNaira(s?.lastPayoutAmount ?? 0)} credited to your account
              </Text>
            </View>
          </View>
        )}

        {/* ── Request Payout button ──────────────────────────────────── */}
        {(() => {
          const pending = s?.pendingPayout ?? 0;
          const meetsThreshold = pending >= MIN_PAYOUT_THRESHOLD;
          const isLastDay = isLastDayOfMonth();
          const canRequest = meetsThreshold && isLastDay;
          const active = canRequest && !isRequestingPayout;

          return (
            <View className="mx-4 mb-5">
              {/* Progress bar toward threshold */}
              <View className="mb-3 bg-white rounded-2xl p-4" style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-xs font-semibold text-gray-600">Payout threshold</Text>
                  <Text className="text-xs font-bold" style={{ color: meetsThreshold ? '#16a34a' : '#7c3aed' }}>
                    ₦{pending.toLocaleString('en-NG')} / ₦{MIN_PAYOUT_THRESHOLD.toLocaleString('en-NG')}
                  </Text>
                </View>
                <View className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((pending / MIN_PAYOUT_THRESHOLD) * 100))}%`,
                      backgroundColor: meetsThreshold ? '#16a34a' : '#7c3aed',
                    }}
                  />
                </View>
                {/* Last-day indicator */}
                <View className="flex-row items-center mt-2 gap-1.5">
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isLastDay ? '#16a34a' : '#f59e0b' }}
                  />
                  <Text className="text-xs" style={{ color: isLastDay ? '#166534' : '#92400e' }}>
                    {isLastDay
                      ? 'Payout window open today (last day of month)'
                      : `Payout window opens on ${lastDayLabel()}`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleRequestPayout}
                disabled={!active}
                className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl"
                style={{ backgroundColor: active ? '#7c3aed' : '#e5e7eb' }}
              >
                {isRequestingPayout ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send-outline" size={18} color={active ? '#fff' : '#9ca3af'} />
                )}
                <Text className="font-bold text-sm" style={{ color: active ? '#fff' : '#9ca3af' }}>
                  {isRequestingPayout ? 'Requesting…' : 'Request Payout'}
                </Text>
              </TouchableOpacity>

              {/* Hint text — show the first unmet condition */}
              {!meetsThreshold && (
                <Text className="text-xs text-center text-gray-400 mt-1.5">
                  Need ₦{(MIN_PAYOUT_THRESHOLD - pending).toLocaleString('en-NG')} more to reach the ₦{MIN_PAYOUT_THRESHOLD.toLocaleString('en-NG')} minimum
                </Text>
              )}
              {meetsThreshold && !isLastDay && (
                <Text className="text-xs text-center text-gray-400 mt-1.5">
                  Request window opens on {lastDayLabel()}
                </Text>
              )}
            </View>
          );
        })()}

        {/* ── How it works ───────────────────────────────────────────── */}
        <View className="mx-4 mb-5 bg-blue-50 rounded-2xl p-4">
          <Text className="text-sm font-bold text-blue-800 mb-2">How Earnings Work</Text>
          <View className="gap-1.5">
            {[
              `Earn ₦${s?.perCaseRate ?? 500} for every case you approve`,
              `Accumulate at least ₦${MIN_PAYOUT_THRESHOLD.toLocaleString('en-NG')} in pending earnings before requesting a payout`,
              'Request a payout on the last day of each month — admin reviews and processes it',
              'Approved payouts are transferred to your registered bank account on the 1st',
              'Rejected cases do not generate earnings',
            ].map((line, i) => (
              <View key={i} className="flex-row gap-2">
                <Text className="text-blue-400 text-xs mt-0.5">•</Text>
                <Text className="text-xs text-blue-700 flex-1 leading-5">{line}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Payout history ─────────────────────────────────────────── */}
        <View className="mx-4">
          <Text className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
            Payout History
          </Text>
          <View className="bg-white rounded-2xl px-4" style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
            {payouts.length === 0 ? (
              <View className="py-8 items-center">
                <Ionicons name="wallet-outline" size={36} color="#d1d5db" />
                <Text className="text-gray-400 text-sm mt-2">No payouts yet</Text>
                <Text className="text-gray-400 text-xs mt-1 text-center px-4">
                Request a payout once you have pending earnings — it will appear here after admin approval.
                </Text>
              </View>
            ) : (
              payouts.map((p) => <PayoutRow key={p.id} item={p} />)
            )}
          </View>
        </View>

        {/* ── CTA ────────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={() => router.push('/(prof-tab)/caseHistory')}
          className="mx-4 mt-5 mb-2 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600"
        >
          <Ionicons name="list-outline" size={18} color="#fff" />
          <Text className="text-white font-bold text-sm">View Case History</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
