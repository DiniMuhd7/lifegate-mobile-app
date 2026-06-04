import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar, FlatList, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePaymentStore } from 'stores/payment-store';
import type { CreditDeduction, PaymentTransaction } from 'types/payment-types';

const STATUS_CONFIG = {
  success:  { bg: '#D1F4E8', iconColor: '#2DBD9E', icon: 'wallet'        as const, label: 'Successful' },
  pending:  { bg: '#FFF0D9', iconColor: '#F39C12', icon: 'hourglass'     as const, label: 'Pending'    },
  failed:   { bg: '#FFE8E8', iconColor: '#E74C3C', icon: 'close-circle'  as const, label: 'Failed'     },
} as const;

function normalizeStatus(raw: string): keyof typeof STATUS_CONFIG {
  const s = raw.toLowerCase();
  if (s === 'success' || s === 'successful') return 'success';
  if (s === 'failed' || s === 'declined')    return 'failed';
  return 'pending';
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'USD') {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `₦${(amount ?? 0).toLocaleString()}`;
}

const TransactionItem = ({ item }: { item: PaymentTransaction }) => {
  const key   = normalizeStatus(String(item.status ?? ''));
  const cfg   = STATUS_CONFIG[key];
  const isTrial = item.bundleId === 'trial';
  const date  = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const amountStr = formatAmount(item.amount ?? 0, item.currency ?? 'NGN');

  return (
    <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
      <View
        className="w-12 h-12 rounded-lg items-center justify-center mr-4"
        style={{ backgroundColor: cfg.bg }}>
        <Ionicons name={isTrial ? 'gift-outline' : cfg.icon} size={24} color={cfg.iconColor} />
      </View>

      <View className="flex-1">
        <Text className="text-[#1A1A1A] text-base font-semibold mb-0.5">
          {isTrial ? 'Trial Credits' : cfg.label}
        </Text>
        <Text className="text-gray-500 text-sm">
          {isTrial ? `+${item.creditsGranted} credits` : `${amountStr} — +${item.creditsGranted} credits`}
        </Text>
        <Text className="text-gray-400 text-xs mt-0.5">{item.txRef}</Text>
      </View>

      <Text className="text-gray-400 text-sm font-medium">{date}</Text>
    </View>
  );
};

// ─── Dx credit deduction row ──────────────────────────────────────────────────

const DeductionItem = ({ item }: { item: CreditDeduction }) => {
  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '';
  const shortId = item.diagnosisId ? item.diagnosisId.slice(0, 8).toUpperCase() : '—';

  return (
    <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
      <View
        className="w-12 h-12 rounded-lg items-center justify-center mr-4"
        style={{ backgroundColor: '#FFE8E8' }}>
        <Ionicons name="medkit-outline" size={22} color="#E74C3C" />
      </View>
      <View className="flex-1">
        <Text className="text-[#1A1A1A] text-base font-semibold mb-0.5">Dx Session</Text>
        <Text className="text-gray-500 text-sm">Case #{shortId}</Text>
      </View>
      <View className="items-end">
        <View className="rounded-full px-2.5 py-1 bg-rose-50 mb-1">
          <Text className="text-xs font-bold text-rose-600">−{item.amount} credit</Text>
        </View>
        <Text className="text-gray-400 text-xs">{date}</Text>
      </View>
    </View>
  );
};

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'payments' | 'deductions';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View className="flex-row mx-5 mb-3 mt-2 bg-gray-100 rounded-xl p-1">
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
            <Ionicons name={icon} size={14} color={isActive ? '#0AADA2' : '#6b7280'} />
            <Text
              className={`text-sm font-semibold ${
                isActive ? 'text-[#0AADA2]' : 'text-gray-500'
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

export default function TransactionHistoryScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('payments');
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const {
    transactions,
    deductions,
    txLoading,
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

  const isLoading = activeTab === 'payments' ? txLoading : deductionsLoading;
  const listData = activeTab === 'payments' ? transactions : deductions;

  return (
    <View
      className="flex-1 bg-[#F5FBFA]"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="p-1">
          <Ionicons name="arrow-back" size={24} color="#2D6A6A" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-[#1A1A1A]">Transactions</Text>
        <View className="w-8" />
      </View>

      {/* Error banner */}
      {error ? (
        <View className="mx-4 mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="warning-outline" size={16} color="#dc2626" />
          <Text className="text-sm text-red-700 flex-1">{error}</Text>
          <TouchableOpacity onPress={clearError}>
            <Ionicons name="close" size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* List */}
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
              <TransactionItem item={item as PaymentTransaction} />
            ) : (
              <DeductionItem item={item as CreditDeduction} />
            )
          }
          contentContainerStyle={{ paddingBottom: 32 }}
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
          ListHeaderComponent={
            <>
              <TabBar active={activeTab} onChange={setActiveTab} />
              {listData.length > 0 ? (
                <Text className="text-gray-600 text-sm font-semibold px-5 pb-2">
                  {listData.length} {activeTab === 'payments' ? 'transaction' : 'usage'}{listData.length !== 1 ? 's' : ''}
                </Text>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-24 px-8">
              <Ionicons
                name={activeTab === 'payments' ? 'receipt-outline' : 'medkit-outline'}
                size={56}
                color="#cbd5e1"
              />
              <Text className="mt-4 text-base text-gray-400">
                {activeTab === 'payments' ? 'No transactions yet' : 'No Dx credits used yet'}
              </Text>
              <Text className="mt-1 text-sm text-gray-400 text-center">
                {activeTab === 'payments'
                  ? 'Your payment history will appear here after your first purchase.'
                  : 'Each AI diagnosis session deducts one credit. Your usage history will appear here.'}
              </Text>
              {activeTab === 'payments' ? (
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/subscription')}
                  activeOpacity={0.8}
                  className="mt-6 rounded-xl bg-[#0EA5A4] px-8 py-3">
                  <Text className="text-base font-semibold text-white">Buy Credits</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}