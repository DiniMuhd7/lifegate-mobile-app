import { useEffect } from 'react';
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
import type { PaymentTransaction } from 'types/payment-types';

const STATUS_STYLE = {
  success: { bg: '#dcfce7', text: '#166534', label: 'Successful' },
  pending: { bg: '#fef9c3', text: '#854d0e', label: 'Pending' },
  failed: { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
} as const;

function TransactionRow({ item }: { item: PaymentTransaction }) {
  const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending;
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '';

  const isTrial = item.bundleId === 'trial';

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {isTrial ? (
            <Ionicons name="gift-outline" size={16} color="#b45309" />
          ) : null}
          <Text className="text-base font-bold text-gray-900">
            {isTrial ? 'Trial Credits' : `₦${(item.amount ?? 0).toLocaleString()}`}
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
    </View>
  );
}
