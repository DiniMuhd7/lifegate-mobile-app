import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, ScrollView} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

interface Transaction {
  id: string;
  status: 'successful' | 'declined' | 'pending';
  title: string;
  amount: string;
  timeAgo: string;
}

const transactionData = {
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