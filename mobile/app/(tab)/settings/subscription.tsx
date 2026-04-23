import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { type WebViewNavigation } from 'react-native-webview';

// WebView is only loaded on native to avoid the "platform not supported" error on web.
const isWeb = Platform.OS === 'web';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebView = isWeb ? null : require('react-native-webview').default;
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
    transactions,
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
    paymentLoading,
  } = usePaymentStore();

  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [cancelledMsg, setCancelledMsg] = useState(false);
  // Web-only: shown after the payment tab is opened so the user can confirm
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchBundles();
  }, []);

  // Refresh balance whenever the screen is focused (e.g. returning from checkout).
  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, [])
  );

  useEffect(() => {
    if (!paymentLink) return;
    if (isWeb) {
      // Open Flutterwave in a new browser tab – WebView is unsupported on web.
      if (typeof window !== 'undefined') {
        window.open(paymentLink, '_blank', 'noopener,noreferrer');
      } else {
        Linking.openURL(paymentLink);
      }
      setShowVerifyPrompt(true);
    } else {
      setShowWebView(true);
    }
  }, [paymentLink]);

  const handleBuyCredits = useCallback(() => {
    if (!selectedBundle) return;
    initiatePayment(selectedBundle, user?.name ?? undefined);
  }, [selectedBundle, user?.name, initiatePayment]);

  // Web path: user pressed "I've paid" after completing payment in the browser tab.
  const handleWebVerify = useCallback(async () => {
    if (!activeTxRef) return;
    setVerifying(true);
    try {
      const tx = await verifyPayment(activeTxRef, '');
      setShowVerifyPrompt(false);
      clearPaymentLink();
      if (tx.status === 'success') {
        router.push({
          pathname: '/(tab)/settings/checkOutScreen',
          params: {
            txRef: tx.txRef,
            amount: String(tx.amount),
            creditsGranted: String(tx.creditsGranted),
            createdAt: tx.createdAt,
          },
        });
        return;
      }
    } catch (_) {}
    setVerifying(false);
    setShowVerifyPrompt(false);
    clearPaymentLink();
    router.push({
      pathname: '/(tab)/settings/payment-failed',
      params: { bundleId: selectedBundle ?? '' },
    });
  }, [activeTxRef, selectedBundle, verifyPayment, clearPaymentLink]);

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
      const flwTxId = params.get('transaction_id') ?? params.get('flw_tx_id') ?? '';

      // User explicitly cancelled — return quietly without a failure screen
      if (status === 'cancelled') {
        setCancelledMsg(true);
        return;
      }

      if ((status === 'successful' || isDev) && txRef) {
        try {
          const tx = await verifyPayment(txRef, flwTxId);
          if (tx.status === 'success') {
            router.push({
              pathname: '/(tab)/settings/checkOutScreen',
              params: {
                txRef: tx.txRef,
                amount: String(tx.amount),
                creditsGranted: String(tx.creditsGranted),
                createdAt: tx.createdAt,
              },
            });
            return;
          }
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

        {cancelledMsg ? (
          <View className="mx-4 mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex-row items-center gap-2">
            <Ionicons name="information-circle-outline" size={16} color="#b45309" />
            <Text className="text-sm text-amber-700 flex-1">Payment was cancelled. No charges were made.</Text>
            <Pressable onPress={() => setCancelledMsg(false)}>
              <Ionicons name="close" size={16} color="#b45309" />
            </Pressable>
          </View>
        ) : null}
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

          {(balance?.balance ?? 0) > 0 &&
            (balance?.balance ?? 0) <= 3 &&
            transactions.length > 0 &&
            transactions.every((t) => t.bundleId === 'trial') && (
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
            disabled={!selectedBundle || paymentLoading}
            onPress={handleBuyCredits}
            className={`rounded-xl py-4 items-center mb-4 flex-row justify-center gap-2 ${
              selectedBundle && !paymentLoading ? 'bg-[#0EA5A4]' : 'bg-gray-300'
            }`}>
            {paymentLoading ? (
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

      {/* Flutterwave payment WebView — native only */}
      {!isWeb && (
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
            {paymentLink && WebView ? (
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
      )}

      {/* Web-only: prompt user to confirm payment after browser tab */}
      {isWeb && (
        <Modal
          visible={showVerifyPrompt}
          animationType="fade"
          transparent
          onRequestClose={() => {
            setShowVerifyPrompt(false);
            clearPaymentLink();
          }}>
          <View className="flex-1 bg-black/50 items-center justify-center px-6">
            <View className="bg-white rounded-2xl p-6 w-full">
              <View className="items-center mb-4">
                <Ionicons name="open-outline" size={40} color="#0EA5A4" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center mb-2">
                Complete Payment
              </Text>
              <Text className="text-sm text-gray-600 text-center mb-6 leading-5">
                A new browser tab has been opened with the Flutterwave payment page.
                Once you have completed the payment, press the button below to confirm.
              </Text>
              <Pressable
                onPress={handleWebVerify}
                disabled={verifying}
                className={`rounded-xl py-4 items-center mb-3 ${verifying ? 'bg-gray-300' : 'bg-[#0EA5A4]'}`}>
                {verifying ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-base font-semibold text-white">I've Completed Payment</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowVerifyPrompt(false);
                  clearPaymentLink();
                }}
                className="rounded-xl py-4 items-center border border-gray-200">
                <Text className="text-base font-semibold text-gray-600">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}
