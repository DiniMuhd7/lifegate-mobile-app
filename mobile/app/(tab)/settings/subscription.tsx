import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import { useAuthStore } from 'stores/auth/auth-store';
import { usePaymentStore } from 'stores/payment-store';
import type { CreditBundle } from 'types/payment-types';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';

const CALLBACK_PREFIX = 'lifegate://payment/callback';
const DEV_PREFIX = 'lifegate://payment/dev';

export default function SubscriptionScreen() {
  const { user } = useAuthStore();
  const {
    balance,
    bundles,
    paymentLink,
    activeTxRef,
    loading,
    error,
    fetchBalance,
    fetchBundles,
    initiatePayment,
    verifyPayment,
    clearError,
    clearPaymentLink,
  } = usePaymentStore();

  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchBundles();
  }, []);

  useEffect(() => {
    if (paymentLink) setShowWebView(true);
  }, [paymentLink]);

  const handleBuyCredits = useCallback(() => {
    if (!selectedBundle) return;
    initiatePayment(selectedBundle, user?.name ?? undefined);
  }, [selectedBundle, user?.name, initiatePayment]);

  const handleNavChange = useCallback(
    async (nav: WebViewNavigation) => {
      const url = nav.url;
      const isCallback = url.startsWith(CALLBACK_PREFIX);
      const isDev = url.startsWith(DEV_PREFIX);
      if (!isCallback && !isDev) return;

      setShowWebView(false);
      clearPaymentLink();

      const params = new URL(url.replace('lifegate://', 'https://dummy.host/')).searchParams;
      const status = params.get('status') ?? '';
      const txRef = params.get('tx_ref') ?? activeTxRef ?? '';
      const flwTxId = params.get('transaction_id') ?? params.get('flw_tx_id') ?? '0';

      if ((status === 'successful' || isDev) && txRef) {
        try {
          const tx = await verifyPayment(txRef, flwTxId);
          if (tx.status === 'success') return;
        } catch (_) {}
      }

      router.push({
        pathname: '/(tab)/settings/payment-failed',
        params: { bundleId: selectedBundle ?? '' },
      });
    },
    [activeTxRef, selectedBundle, verifyPayment, clearPaymentLink]
  );

  const displayBundles: CreditBundle[] = bundles.length
    ? bundles
    : [
        { id: '2000', amountNaira: 2000, credits: 5, label: '₦2,000 — 5 Credits' },
        { id: '5000', amountNaira: 5000, credits: 15, label: '₦5,000 — 15 Credits' },
        { id: '10000', amountNaira: 10000, credits: 40, label: '₦10,000 — 40 Credits' },
      ];

  const selectedBundleData = displayBundles.find((bundle) => bundle.id === selectedBundle);

  return (
    <View className="flex-1 bg-[#F2F8F8]">
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
          <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </Pressable>
          <Text className="text-xl font-black text-gray-900">Subscription</Text>
          <View className="w-10" />
        </View>

        {error ? (
          <View className="mx-4 mb-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
            <Ionicons name="warning-outline" size={16} color="#dc2626" />
            <Text className="text-sm text-red-700 flex-1">{error}</Text>
            <Pressable onPress={clearError}>
              <Ionicons name="close" size={16} color="#dc2626" />
            </Pressable>
          </View>
        ) : null}

        <ScrollView className="flex-1 px-4 pt-1" contentContainerStyle={{ paddingBottom: 100 }}>
          <View className="mb-4 rounded-3xl bg-white border border-[#D9EEEE] p-5 overflow-hidden">
            <View className="absolute -top-8 -right-6 h-28 w-28 rounded-full bg-[#E7F8F7]" />
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">
              Current Balance
            </Text>
            <Text className="text-5xl font-black text-[#0EA5A4]">
              {balance?.balance ?? 0}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">credits available for diagnosis sessions</Text>
          </View>

          {(balance?.balance ?? 0) > 0 && (balance?.balance ?? 0) <= 3 && (
            <View className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex-row items-start gap-3">
              <Ionicons name="gift-outline" size={20} color="#b45309" style={{ marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-amber-800">
                  You are currently using trial credits
                </Text>
                <Text className="text-xs text-amber-700 mt-0.5 leading-4">
                  Each clinical diagnosis session costs 1 credit. Top up anytime to continue uninterrupted.
                </Text>
              </View>
            </View>
          )}

          <View className="mb-6 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="history" size={20} color="#0EA5A4" />
              <Text className="ml-2 text-base font-semibold text-gray-900">Transactions</Text>
            </View>
            <Pressable
              className="flex-row items-center"
              onPress={() => router.push('/(tab)/settings/transactions')}>
              <Text className="text-sm font-semibold text-[#0EA5A4]">View all</Text>
              <Ionicons name="chevron-forward" size={16} color="#0EA5A4" />
            </Pressable>
          </View>

          <Text className="mb-3 text-base font-semibold text-gray-900">Choose a Credit Package</Text>
          {displayBundles.map((bundle, idx) => {
            const selected = selectedBundle === bundle.id;
            const bonus = idx === displayBundles.length - 1;
            return (
              <Pressable
                key={bundle.id}
                onPress={() => setSelectedBundle(selected ? null : bundle.id)}
                className={`mb-3 rounded-2xl border-2 p-4 bg-white ${
                  selected ? 'border-[#0EA5A4]' : 'border-[#DCEEEE]'
                }`}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xl font-black text-gray-900">₦{bundle.amountNaira.toLocaleString()}</Text>
                  {bonus ? (
                    <View className="px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]">
                      <Text className="text-[11px] font-semibold text-[#047857]">Best value</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-base font-semibold text-gray-900">{bundle.credits} Credits</Text>
                <Text className="mt-1 text-sm text-gray-600 leading-5">
                  Access to AI triage and licensed clinician diagnostics.
                </Text>

                <View className="mt-3 flex-row items-center justify-end">
                  <View
                    className={`h-6 w-6 rounded border-2 items-center justify-center ${
                      selected ? 'border-[#0EA5A4] bg-[#0EA5A4]' : 'border-[#0EA5A4] bg-transparent'
                    }`}>
                    {selected ? <Ionicons name="checkmark" size={14} color="white" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}

          {selectedBundleData ? (
            <View className="mb-3 rounded-xl bg-[#EEF8F8] border border-[#D4ECEB] px-4 py-3">
              <Text className="text-sm text-gray-700">
                You selected <Text className="font-bold">{selectedBundleData.credits} credits</Text> for{' '}
                <Text className="font-bold">₦{selectedBundleData.amountNaira.toLocaleString()}</Text>.
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={!selectedBundle || loading}
            onPress={handleBuyCredits}
            className={`rounded-xl py-4 items-center mb-4 flex-row justify-center gap-2 ${
              selectedBundle && !loading ? 'bg-[#0EA5A4]' : 'bg-gray-300'
            }`}>
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="card-outline" size={20} color="white" />
                <Text className="text-base font-semibold text-white">Proceed to Secure Payment</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* Flutterwave payment WebView */}
      <Modal
        visible={showWebView}
        animationType="slide"
        onRequestClose={() => {
          setShowWebView(false);
          clearPaymentLink();
        }}>
        <View className="flex-1">
          <View className="flex-row items-center px-4 pt-12 pb-3 bg-white border-b border-gray-100">
            <Pressable
              onPress={() => {
                setShowWebView(false);
                clearPaymentLink();
              }}
              className="p-2">
              <Ionicons name="close" size={24} color="black" />
            </Pressable>
            <Text className="ml-3 text-base font-semibold text-gray-900">Secure Payment</Text>
            <View className="ml-auto">
              <Ionicons name="lock-closed" size={16} color="#0EA5A4" />
            </View>
          </View>
          {paymentLink ? (
            <WebView
              source={{ uri: paymentLink }}
              onNavigationStateChange={handleNavChange}
              startInLoadingState
              renderLoading={() => (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color="#0EA5A4" size="large" />
                </View>
              )}
            />
          ) : null}
        </View>
      </Modal>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}
