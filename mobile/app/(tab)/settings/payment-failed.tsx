import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

const BUNDLE_LABELS: Record<string, string> = {
  '2000': '5 Credits',
  '5000': '15 Credits',
  '10000': '40 Credits',
};

export default function PaymentFailedScreen() {
  const { bundleId } = useLocalSearchParams<{ bundleId?: string }>();
  const bundleLabel = bundleId ? BUNDLE_LABELS[bundleId] ?? bundleId : null;

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-6">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Payment Failed</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 48 }}>
        {/* Failure icon */}
        <View className="w-24 h-24 rounded-full bg-red-100 items-center justify-center mb-8">
          <Ionicons name="close-circle" size={56} color="#dc2626" />
        </View>

        {/* Title */}
        <Text className="text-2xl font-bold text-gray-900 mb-3 text-center">
          Oops! Your payment didn't go through
        </Text>

        {/* Plain-language explanation */}
        <Text className="text-base text-gray-600 text-center leading-6 mb-4">
          We were unable to process your payment at this time. Don't worry — no money has been
          charged to your account.
        </Text>

        {bundleLabel ? (
          <View className="rounded-xl bg-gray-50 border border-gray-200 px-5 py-4 w-full mb-6">
            <Text className="text-sm text-gray-500 mb-1">Package selected</Text>
            <Text className="text-base font-semibold text-gray-900">{bundleLabel}</Text>
          </View>
        ) : null}

        {/* Common reasons */}
        <View className="w-full mb-8">
          <Text className="text-sm font-semibold text-gray-700 mb-3">
            This can happen when:
          </Text>
          {[
            'Your card has insufficient funds',
            'The card details entered were incorrect',
            'Your bank declined the transaction',
            'The session timed out during payment',
          ].map((reason) => (
            <View key={reason} className="flex-row items-start mb-2 gap-2">
              <Ionicons name="ellipse" size={6} color="#6b7280" style={{ marginTop: 7 }} />
              <Text className="text-sm text-gray-600 flex-1">{reason}</Text>
            </View>
          ))}
        </View>

        {/* Try again */}
        <Pressable
          onPress={() => router.replace('/(tab)/settings/subscription')}
          className="w-full rounded-xl bg-[#0EA5A4] py-4 items-center mb-4">
          <Text className="text-base font-semibold text-white">Try Again</Text>
        </Pressable>

        {/* Contact support */}
        <Pressable
          onPress={() => router.push('/(tab)/settings/contact-us')}
          className="w-full rounded-xl border border-gray-200 py-4 items-center">
          <Text className="text-base font-semibold text-gray-700">Contact Support</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
