import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StatusBar, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePaymentStore } from 'stores/payment-store';
import type { PaymentTransaction } from 'types/payment-types';

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

const TransactionItem = ({ item }: { item: PaymentTransaction }) => {
  const key   = normalizeStatus(String(item.status ?? ''));
  const cfg   = STATUS_CONFIG[key];
  const isTrial = item.bundleId === 'trial';
  const date  = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

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
          {isTrial ? `+${item.creditsGranted} credits` : `₦${(item.amount ?? 0).toLocaleString()} — +${item.creditsGranted} credits`}
        </Text>
        <Text className="text-gray-400 text-xs mt-0.5">{item.txRef}</Text>
      </View>

      <Text className="text-gray-400 text-sm font-medium">{date}</Text>
    </View>
  );
};

export default function TransactionHistoryScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { transactions, txLoading, error, fetchTransactions, clearError } = usePaymentStore();

  useEffect(() => { fetchTransactions(50); }, []);

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
      {txLoading && transactions.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0EA5A4" size="large" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id ?? item.txRef}
          renderItem={({ item }) => <TransactionItem item={item} />}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={txLoading}
              onRefresh={() => fetchTransactions(50)}
              tintColor="#0EA5A4"
              colors={['#0EA5A4']}
            />
          }
          ListHeaderComponent={
            transactions.length > 0 ? (
              <Text className="text-gray-600 text-sm font-semibold px-5 py-3">
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-24 px-8">
              <Ionicons name="receipt-outline" size={56} color="#cbd5e1" />
              <Text className="mt-4 text-base text-gray-400">No transactions yet</Text>
              <Text className="mt-1 text-sm text-gray-400 text-center">
                Your payment history will appear here after your first purchase.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tab)/settings/subscription')}
                activeOpacity={0.8}
                className="mt-6 rounded-xl bg-[#0EA5A4] px-8 py-3">
                <Text className="text-base font-semibold text-white">Buy Credits</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

interface Transaction {
  id: string;
  status: 'successful' | 'declined' | 'pending';
  title: string;
  amount: string;
  timeAgo: string;
}

const transactionData: { today: Transaction[]; yesterday: Transaction[]; older: Transaction[] } = {
  today: [
    { id: '1', status: 'successful', title: 'Payment Successful', amount: '₦5,000 LifeGate Credit', timeAgo: '2h ago' },
    { id: '2', status: 'successful', title: 'Payment Successful', amount: '₦2,000 LifeGate Credit', timeAgo: '5h ago' },
  ],
  yesterday: [
    { id: '3', status: 'declined', title: 'Payment Declined', amount: '₦2,000 payment declined', timeAgo: '12h ago' },
  ],
  older: [
    { id: '4', status: 'pending', title: 'Pending', amount: '₦2,000 payment declined', timeAgo: '2d ago' },
    { id: '5', status: 'successful', title: 'Payment Successful', amount: '₦10,000 LifeGate Credit', timeAgo: '6d ago' },
  ],
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'successful':
      return '#D1F4E8';
    case 'declined':
      return '#FFE8E8';
    case 'pending':
      return '#FFF0D9';
    default:
      return '#F0F0F0';
  }
};

const getStatusIconColor = (status: string) => {
  switch (status) {
    case 'successful':
      return '#2DBD9E';
    case 'declined':
      return '#E74C3C';
    case 'pending':
      return '#F39C12';
    default:
      return '#95A5A6';
  }
};

const TransactionItem = ({ transaction }: { transaction: Transaction }) => {
  const bgColor = getStatusColor(transaction.status);
  const iconColor = getStatusIconColor(transaction.status);

  const getIcon = () => {
    switch (transaction.status) {
      case 'successful':
        return 'wallet';
      case 'declined':
        return 'close-circle';
      case 'pending':
        return 'hourglass';
      default:
        return 'help-circle';
    }
  };

  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      className="flex-row items-center px-5 py-4 border-b border-gray-100"
    >
      <View 
        className="w-12 h-12 rounded-lg items-center justify-center mr-4"
        style={{ backgroundColor: bgColor }}
      >
        <Ionicons name={getIcon()} size={24} color={iconColor} />
      </View>

      <View className="flex-1">
        <Text className="text-[#1A1A1A] text-base font-semibold mb-1">
          {transaction.title}
        </Text>
        <Text className="text-gray-500 text-sm font-medium">
          {transaction.amount}
        </Text>
      </View>

      <Text className="text-gray-400 text-sm font-medium">
        {transaction.timeAgo}
      </Text>
    </TouchableOpacity>
  );
};

const TransactionSection = ({ title, transactions }: { title: string; transactions: Transaction[] }) => {
  return (
    <View className="mb-4">
      <Text className="text-gray-600 text-sm font-semibold px-5 py-3">
        {title}
      </Text>
      <View className="bg-white">
        {transactions.map((transaction, index) => (
          <View key={transaction.id}>
            <TransactionItem transaction={transaction} />
            {index < transactions.length - 1 && <View />}
          </View>
        ))}
      </View>
    </View>
  );
};

export default function TransactionHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  return (
    <View 
      className="flex-1 bg-[#F5FBFA]" 
      style={{ 
        paddingTop: insets.top, 
        paddingBottom: insets.bottom 
      }}
    >
      <StatusBar barStyle="dark-content" />

      {/* --- Header Section --- */}
      <View className="flex-row items-center justify-between px-5 py-4 bg-white border-b border-gray-100">
        <TouchableOpacity 
          onPress={() => router.back()}
          activeOpacity={0.7} 
          className="p-1"
        >
          <Ionicons name="arrow-back" size={24} color="#2D6A6A" />
        </TouchableOpacity>
        
        <Text className="text-xl font-bold text-[#1A1A1A]">Transactions</Text>
        
        <View className="w-8" />
      </View>

      {/* --- Transaction List --- */}
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <TransactionSection title="Today" transactions={transactionData.today} />
        <TransactionSection title="Yesterday" transactions={transactionData.yesterday} />
        <TransactionSection title="Older" transactions={transactionData.older} />
      </ScrollView>
    </View>
  );
}