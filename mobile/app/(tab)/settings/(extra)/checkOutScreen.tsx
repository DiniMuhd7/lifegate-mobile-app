import React from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons} from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';

const SuccessCheckmark = () => {
  return (
    <View className="relative w-32 h-32 items-center justify-center">
      <Svg width="128" height="128" viewBox="0 0 128 128">
        {/* Background circle */}
        <Circle cx="64" cy="64" r="50" fill="#14A8A8" />
        
        {/* Checkmark */}
        <Path
          d="M 45 65 L 58 78 L 85 50"
          stroke="white"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Decorative dots */}
      <View className="absolute w-32 h-32 items-center justify-center">
        {[0, 45, 90, 135, 180, 225, 270, 315, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((angle) => {
          const isLarge = angle % 90 === 0;
          const size = isLarge ? 8 : 4;
          const radius = 58;
          const rad = (angle * Math.PI) / 180;
          const x = 64 + radius * Math.cos(rad);
          const y = 64 + radius * Math.sin(rad);

          return (
            <View
              key={angle}
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                backgroundColor: '#14A8A8',
                left: x - size / 2,
                top: y - size / 2,
              }}
            />
          );
        })}
      </View>
    </View>
  );
};

const TransactionDetailRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => {
  return (
    <View className="flex-row items-center justify-between py-3 px-5 bg-gray-50 border-b border-gray-100">
      <Text className="text-gray-600 text-base font-medium">{label}</Text>
      <View className="flex-row items-center">
        <Text className={`text-base font-semibold ${highlight ? 'text-green-600' : 'text-gray-900'}`}>
          {value}
        </Text>
        {highlight && <Ionicons name="checkmark-circle" size={18} color="#10B981" className="ml-2" />}
      </View>
    </View>
  );
};

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { txRef, amount, creditsGranted, createdAt } = useLocalSearchParams<{
    txRef?: string;
    amount?: string;
    creditsGranted?: string;
    createdAt?: string;
  }>();

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const displayAmount = amount ? `₦${Number(amount).toLocaleString()}` : '—';
  const displayTxRef = txRef ?? '—';
  const displayCredits = creditsGranted ? `+${creditsGranted} credits` : null;

  return (
    <View
      className="flex-1 bg-white"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <StatusBar barStyle="dark-content" />

      {/* --- Main Content --- */}
      <View className="flex-1 items-center justify-center px-5">
        {/* Success Checkmark Animation */}
        <SuccessCheckmark />

        {/* Success Message */}
        <Text className="text-3xl font-bold text-gray-900 mt-6 mb-2 text-center">
          Payment Successful!
        </Text>
        <Text className="text-base text-gray-600 text-center mb-10">
          Thank you for your purchase.{'\n'}Your credits have been added.
        </Text>

        {/* Transaction Details */}
        <View className="w-full bg-white rounded-2xl overflow-hidden mb-8">
          <TransactionDetailRow label="Transaction Date" value={formattedDate} />
          <TransactionDetailRow label="Transaction ID" value={displayTxRef} />
          {displayCredits ? (
            <TransactionDetailRow label="Credits Added" value={displayCredits} />
          ) : null}
          <TransactionDetailRow label="Amount Paid" value={displayAmount} />
          <TransactionDetailRow label="Payment Status" value="Success" highlight={true} />
        </View>
      </View>

      {/* --- Done Button --- */}
      <View className="px-5 pb-6">
        <TouchableOpacity
          onPress={() => router.replace('/(tab)/settings/subscription')}
          activeOpacity={0.8}
          className="w-full bg-[#14A8A8] rounded-2xl py-4 items-center justify-center"
        >
          <Text className="text-white font-bold text-base">Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
