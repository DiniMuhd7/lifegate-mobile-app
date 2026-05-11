import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePaymentStore } from 'stores/payment-store';
import type { CreditDeduction, PaymentTransaction } from 'types/payment-types';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const STATUS_STYLE = {
  success: { bg: '#dcfce7', text: '#166534', label: 'Successful' },
  pending: { bg: '#fef9c3', text: '#854d0e', label: 'Pending' },
  failed: { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
} as const;

function formatAmount(amount: number, currency: string): string {
  if (currency === 'USD') {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `₦${(amount ?? 0).toLocaleString()}`;
}

// ─── Payment transaction row ──────────────────────────────────────────────────

function TransactionRow({ item }: { item: PaymentTransaction }) {
  const rawStatus = String(item.status ?? '').toLowerCase();
  const normalizedStatus =
    rawStatus === 'success' || rawStatus === 'successful'
      ? 'success'
      : rawStatus === 'failed' || rawStatus === 'declined'
        ? 'failed'
        : 'pending';
  const s = STATUS_STYLE[normalizedStatus] ?? STATUS_STYLE.pending;
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '';

  const isTrial = item.bundleId === 'trial';
  const amountStr = formatAmount(item.amount ?? 0, item.currency ?? 'NGN');

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {isTrial ? (
            <Ionicons name="gift-outline" size={16} color="#b45309" />
          ) : null}
          <Text className="text-base font-bold text-gray-900">
            {isTrial ? 'Trial Credits' : amountStr}
          </Text>
        </View>
        <View
          style={{ backgroundColor: s.bg }}
          className="rounded-full px-3 py-1">
          <Text style={{ color: s.text }} className="text-xs font-semibold">
            {s.label}
          </Text>
        </View>
      </View>

      {item.creditsGranted ? (
        <View className="flex-row items-center gap-1 mb-1">
          <Ionicons name="flash" size={13} color="#0EA5A4" />
          <Text className="text-sm text-[#0EA5A4] font-semibold">
            +{item.creditsGranted} credits added
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-xs text-gray-400">{item.txRef}</Text>
        <Text className="text-xs text-gray-400">{date}</Text>
      </View>
    </View>
  );
}

// ─── Dx credit deduction row ──────────────────────────────────────────────────

function DeductionRow({ item }: { item: CreditDeduction }) {
  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '';
  const shortId = item.diagnosisId ? item.diagnosisId.slice(0, 8).toUpperCase() : '—';

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 rounded-full bg-rose-50 items-center justify-center">
            <Ionicons name="medkit-outline" size={15} color="#e11d48" />
          </View>
          <View>
            <Text className="text-sm font-bold text-gray-900">Dx Session</Text>
            <Text className="text-xs text-gray-400 mt-0.5">Case #{shortId}</Text>
          </View>
        </View>
        <View className="rounded-full px-3 py-1 bg-rose-50">
          <Text className="text-xs font-bold text-rose-600">−{item.amount} credit</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1 mt-1">
        <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
        <Text className="text-xs text-gray-400">{date}</Text>
      </View>
    </View>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'payments' | 'deductions';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View className="flex-row mx-4 mb-4 bg-gray-100 rounded-xl p-1">
      {(['payments', 'deductions'] as Tab[]).map((tab) => {
        const isActive = active === tab;
        const label = tab === 'payments' ? 'Payments' : 'Dx Credits';
        const icon: keyof typeof Ionicons.glyphMap =
          tab === 'payments' ? 'wallet-outline' : 'medkit-outline';
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg ${
              isActive ? 'bg-white shadow-sm' : ''
            }`}>
            <Ionicons name={icon} size={14} color={isActive ? '#0EA5A4' : '#6b7280'} />
            <Text
              className={`text-sm font-semibold ${
                isActive ? 'text-[#0EA5A4]' : 'text-gray-500'
              }`}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('payments');

  const {
    transactions,
    deductions,
    loading,
    deductionsLoading,
    error,
    fetchTransactions,
    fetchDeductions,
    clearError,
  } = usePaymentStore();

  useEffect(() => {
    fetchTransactions(50);
    fetchDeductions(100);
  }, []);

  const isLoading = activeTab === 'payments' ? loading : deductionsLoading;
  const listData = activeTab === 'payments' ? transactions : deductions;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Transaction History</Text>
        <View className="w-10" />
      </View>

      {/* Error */}
      {error ? (
        <View className="mx-4 mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="warning-outline" size={16} color="#dc2626" />
          <Text className="text-sm text-red-700 flex-1">{error}</Text>
          <Pressable onPress={clearError}>
            <Ionicons name="close" size={16} color="#dc2626" />
          </Pressable>
        </View>
      ) : null}

      {isLoading && listData.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0EA5A4" size="large" />
        </View>
      ) : (
        <FlatList
          data={listData as (PaymentTransaction | CreditDeduction)[]}
          keyExtractor={(item) =>
            activeTab === 'payments'
              ? (item as PaymentTransaction).id ?? (item as PaymentTransaction).txRef
              : (item as CreditDeduction).id
          }
          renderItem={({ item }) =>
            activeTab === 'payments' ? (
              <TransactionRow item={item as PaymentTransaction} />
            ) : (
              <DeductionRow item={item as CreditDeduction} />
            )
          }
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          ListHeaderComponent={<TabBar active={activeTab} onChange={setActiveTab} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => {
                fetchTransactions(50);
                fetchDeductions(100);
              }}
              tintColor="#0EA5A4"
              colors={['#0EA5A4']}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-24">
              <Ionicons
                name={activeTab === 'payments' ? 'receipt-outline' : 'medkit-outline'}
                size={56}
                color="#cbd5e1"
              />
              <Text className="mt-4 text-base text-gray-400">
                {activeTab === 'payments' ? 'No transactions yet' : 'No Dx credits used yet'}
              </Text>
              <Text className="mt-1 text-sm text-gray-400 text-center px-8">
                {activeTab === 'payments'
                  ? 'Your payment history will appear here after your first purchase.'
                  : 'Each AI diagnosis session deducts one credit. Your usage history will appear here.'}
              </Text>
              {activeTab === 'payments' ? (
                <Pressable
                  onPress={() => router.push('/(tab)/settings/subscription')}
                  className="mt-6 rounded-xl bg-[#0EA5A4] px-8 py-3">
                  <Text className="text-base font-semibold text-white">Buy Credits</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}

const STATUS_STYLE = {
  success: { bg: '#dcfce7', text: '#166534', label: 'Successful' },
  pending: { bg: '#fef9c3', text: '#854d0e', label: 'Pending' },
  failed: { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
} as const;

function formatAmount(amount: number, currency: string): string {
  if (currency === 'USD') {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `₦${(amount ?? 0).toLocaleString()}`;
}

function TransactionRow({ item }: { item: PaymentTransaction }) {
  const rawStatus = String(item.status ?? '').toLowerCase();
  const normalizedStatus =
    rawStatus === 'success' || rawStatus === 'successful'
      ? 'success'
      : rawStatus === 'failed' || rawStatus === 'declined'
        ? 'failed'
        : 'pending';
  const s = STATUS_STYLE[normalizedStatus] ?? STATUS_STYLE.pending;
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '';

  const isTrial = item.bundleId === 'trial';
  const amountStr = formatAmount(item.amount ?? 0, item.currency ?? 'NGN');

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {isTrial ? (
            <Ionicons name="gift-outline" size={16} color="#b45309" />
          ) : null}
          <Text className="text-base font-bold text-gray-900">
            {isTrial ? 'Trial Credits' : amountStr}
          </Text>
        </View>
        <View
          style={{ backgroundColor: s.bg }}
          className="rounded-full px-3 py-1">
          <Text style={{ color: s.text }} className="text-xs font-semibold">
            {s.label}
          </Text>
        </View>
      </View>

      {item.creditsGranted ? (
        <View className="flex-row items-center gap-1 mb-1">
          <Ionicons name="flash" size={13} color="#0EA5A4" />
          <Text className="text-sm text-[#0EA5A4] font-semibold">
            +{item.creditsGranted} credits added
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-xs text-gray-400">{item.txRef}</Text>
        <Text className="text-xs text-gray-400">{date}</Text>
      </View>
    </View>
  );
}

export default function TransactionsScreen() {
  const { transactions, loading, error, fetchTransactions, clearError } = usePaymentStore();

  useEffect(() => {
    fetchTransactions(50);
  }, []);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Transaction History</Text>
        <View className="w-10" />
      </View>

      {/* Error */}
      {error ? (
        <View className="mx-4 mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="warning-outline" size={16} color="#dc2626" />
          <Text className="text-sm text-red-700 flex-1">{error}</Text>
          <Pressable onPress={clearError}>
            <Ionicons name="close" size={16} color="#dc2626" />
          </Pressable>
        </View>
      ) : null}

      {loading && transactions.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0EA5A4" size="large" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id ?? item.txRef}
          renderItem={({ item }) => <TransactionRow item={item} />}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => fetchTransactions(50)}
              tintColor="#0EA5A4"
              colors={['#0EA5A4']}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-24">
              <Ionicons name="receipt-outline" size={56} color="#cbd5e1" />
              <Text className="mt-4 text-base text-gray-400">No transactions yet</Text>
              <Text className="mt-1 text-sm text-gray-400 text-center px-8">
                Your payment history will appear here after your first purchase.
              </Text>
              <Pressable
                onPress={() => router.push('/(tab)/settings/subscription')}
                className="mt-6 rounded-xl bg-[#0EA5A4] px-8 py-3">
                <Text className="text-base font-semibold text-white">Buy Credits</Text>
              </Pressable>
            </View>
          }
        />
      )}
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}
