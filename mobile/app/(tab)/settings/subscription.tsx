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
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { usePaymentStore } from 'stores/payment-store';
import { useChatStore } from 'stores/chat-store';
import type { CreditBundle, PaymentCurrency } from 'types/payment-types';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';

const isWeb = Platform.OS === 'web';
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
    getTxStatus,
    verifyPayment,
    clearError,
    clearPaymentLink,
    bundlesLoading,
    paymentLoading,
  } = usePaymentStore();

  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setConversationMode = useChatStore((state) => state.setConversationMode);

  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [currency, setCurrency] = useState<PaymentCurrency>('NGN');
  const [cancelledMsg, setCancelledMsg] = useState(false);
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  // Native: true once the user has tapped "Open Payment Page" in the modal
  const [paymentPageOpened, setPaymentPageOpened] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // 0 = not started; positive = polling phase step; negative = fallback verify step
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  // Label shown in the modal during verification
  const [verifyLabel, setVerifyLabel] = useState('');
  const [openPaymentError, setOpenPaymentError] = useState<string | null>(null);

  const normalizePaymentUrl = useCallback((url: string | null) => {
    if (!url) return null;
    const clean = url.trim();
    if (!clean) return null;
    try {
      const parsed = new URL(clean);
      // Allow secure URLs and localhost/dev callbacks used in staging.
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return clean;
      return null;
    } catch {
      return null;
    }
  }, []);

  const openPaymentInExternalBrowser = useCallback(async (url: string) => {
    const normalized = normalizePaymentUrl(url);
    if (!normalized) return false;

    try {
      // Force a real browser app (Chrome/Safari) when possible.
      if (!isWeb) {
        const parsed = new URL(normalized);
        const withoutScheme = normalized.replace(/^https?:\/\//, '');

        if (Platform.OS === 'android') {
          const chromeUrl = `googlechrome://${withoutScheme}`;
          const canChrome = await Linking.canOpenURL(chromeUrl);
          if (canChrome) {
            await Linking.openURL(chromeUrl);
            return true;
          }
        }

        if (Platform.OS === 'ios') {
          const chromeScheme = parsed.protocol === 'https:' ? 'googlechromes://' : 'googlechrome://';
          const chromeUrl = `${chromeScheme}${withoutScheme}`;
          const canChrome = await Linking.canOpenURL(chromeUrl);
          if (canChrome) {
            await Linking.openURL(chromeUrl);
            return true;
          }
        }
      }

      const supported = await Linking.canOpenURL(normalized);
      if (!supported) return false;
      await Linking.openURL(normalized);
      return true;
    } catch {
      return false;
    }
  }, [normalizePaymentUrl]);

  useEffect(() => {
    fetchBalance();
    fetchBundles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh balance whenever the screen is focused (e.g. returning from checkout).
  useFocusEffect(
    useCallback(() => {
      fetchBalance();
      fetchBundles();
    }, [fetchBalance, fetchBundles])
  );

  useEffect(() => {
	if (!selectedBundle) return;
	if (!bundles.some((bundle) => bundle.id === selectedBundle)) {
		setSelectedBundle(null);
	}
  }, [bundles, selectedBundle]);

  const switchActiveChatToClinical = useCallback(() => {
    if (!activeConversationId) return;
    setConversationMode(activeConversationId, 'clinical_diagnosis');
  }, [activeConversationId, setConversationMode]);

  useEffect(() => {
    if (!paymentLink) return;
    const normalized = normalizePaymentUrl(paymentLink);
    if (!normalized) {
      setOpenPaymentError('Invalid payment URL returned. Please try again.');
      clearPaymentLink();
      return;
    }
    setOpenPaymentError(null);
    setPaymentPageOpened(false);
    // Always open checkout in an external browser app/tab handled by the OS.
    openPaymentInExternalBrowser(normalized).then((ok) => {
      setPaymentPageOpened(ok);
      if (!ok) {
        setOpenPaymentError('Could not open your browser. Tap "Open Payment Page" to retry.');
      }
    });
    // Always show the modal across platforms.
    setShowVerifyPrompt(true);
  }, [paymentLink, clearPaymentLink, normalizePaymentUrl, openPaymentInExternalBrowser]);

  const handleBuyCredits = useCallback(() => {
    if (!selectedBundle) return;
    initiatePayment(selectedBundle, user?.name ?? undefined, currency);
  }, [selectedBundle, user?.name, currency, initiatePayment]);

  // Called when the user taps "Open Payment Page" in the modal.
  // Running inside a Pressable onPress means it IS a user gesture — no popup block.
  const handleOpenPaymentPage = useCallback(() => {
    if (!paymentLink) return;
    openPaymentInExternalBrowser(paymentLink).then((ok) => {
      setPaymentPageOpened(ok);
      setOpenPaymentError(ok ? null : 'Could not open your browser. Please check browser availability and try again.');
    });
  }, [paymentLink, openPaymentInExternalBrowser]);

  // Web path: user pressed "I've paid".
  // Strategy: poll GET /payments/tx-status (DB-only, no Flutterwave call) so the
  // webhook is the primary confirmation path. Only call POST /payments/verify
  // (which contacts Flutterwave directly) once as a fallback if the webhook
  // hasn't arrived after ~30 s of polling.
  const handleWebVerify = useCallback(async () => {
    if (!activeTxRef) return;
    setVerifying(true);
    setVerifyAttempt(0);
    setVerifyLabel('');

    const txRef = activeTxRef;

    const navigate = (tx: { txRef: string; amount: number; creditsGranted: number; createdAt: string }) => {
      setShowVerifyPrompt(false);
      setVerifying(false);
      setVerifyAttempt(0);
      setVerifyLabel('');
      switchActiveChatToClinical();
      router.push({
        pathname: '/(tab)/settings/checkOutScreen',
        params: {
          txRef: tx.txRef,
          amount: String(tx.amount),
          creditsGranted: String(tx.creditsGranted),
          createdAt: tx.createdAt,
        },
      });
    };

    // ── Phase 1: Poll DB status (webhook path) ───────────────────────────────
    // Poll every 3 s for up to 30 s. If the webhook has already credited the
    // account the very first poll will return success instantly.
    const pollIntervals = [1000, 2000, 3000, 3000, 3000, 4000, 4000, 5000, 5000, 6000];
    for (let i = 0; i < pollIntervals.length; i++) {
      setVerifyAttempt(i + 1);
      setVerifyLabel(`Waiting for payment confirmation… (${i + 1}/${pollIntervals.length})`);
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervals[i]));
      try {
        const tx = await getTxStatus(txRef);
        if (tx.status === 'success') { navigate(tx); return; }
        if (tx.status === 'failed') break;
      } catch (_) { /* network hiccup — keep polling */ }
    }

    // ── Phase 2: Fallback — active Flutterwave verify (once) ─────────────────
    // Webhook either hasn't arrived yet or was delayed. Call verify directly
    // so the user isn't left waiting indefinitely.
    setVerifyLabel('Confirming with payment provider…');
    try {
      const tx = await verifyPayment(txRef, '');
      if (tx.status === 'success') { navigate(tx); return; }
      if (tx.status === 'pending') {
        // Still pending after active verify — wait a final 10 s then check DB once more.
        setVerifyLabel('Still processing — finalising…');
        await new Promise<void>((resolve) => setTimeout(resolve, 10000));
        try {
          const tx2 = await getTxStatus(txRef);
          if (tx2.status === 'success') { navigate(tx2); return; }
        } catch (_) {}
      }
    } catch (_) { /* verify call failed — fall through to failure screen */ }

    // ── All paths exhausted ──────────────────────────────────────────────────
    setVerifying(false);
    setVerifyAttempt(0);
    setVerifyLabel('');
    setShowVerifyPrompt(false);
    clearPaymentLink();
    router.push({
      pathname: '/(tab)/settings/payment-failed',
      params: { bundleId: selectedBundle ?? '' },
    });
  }, [activeTxRef, selectedBundle, getTxStatus, verifyPayment, clearPaymentLink, switchActiveChatToClinical]);

  // Resume path: user returned from external browser without deep-link callback.
  // When subscription regains focus, auto-run verification for active tx.
  useFocusEffect(
    useCallback(() => {
      if (!isWeb && showVerifyPrompt && paymentPageOpened && activeTxRef && !verifying) {
        handleWebVerify();
      }
    }, [showVerifyPrompt, paymentPageOpened, activeTxRef, verifying, handleWebVerify])
  );

  // Auto-trigger handleWebVerify when the payment tab posts a completion message
  // (posted by the backend /payment-callback HTML page via window.opener.postMessage).
  useEffect(() => {
    if (!showVerifyPrompt || !isWeb) return;
    if (typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'payment_complete') return;
      const msgStatus: string = event.data?.status ?? 'successful';
      if (msgStatus === 'cancelled') {
        setShowVerifyPrompt(false);
        clearPaymentLink();
        setCancelledMsg(true);
        return;
      }
      if (msgStatus === 'failed') {
        setShowVerifyPrompt(false);
        clearPaymentLink();
        router.push({ pathname: '/(tab)/settings/payment-failed', params: { bundleId: selectedBundle ?? '' } });
        return;
      }
      // successful — start verification automatically
      handleWebVerify();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [showVerifyPrompt, handleWebVerify, clearPaymentLink, selectedBundle]);

  // Native path: handle Flutterwave deep-link callback
  // (lifegate://payment/callback?... or lifegate://payment/dev?...).
  const handleDeepLinkVerify = useCallback(
    async (url: string) => {
      if (!url.startsWith(CALLBACK_PREFIX) && !url.startsWith(DEV_PREFIX)) return;

      let params: URLSearchParams;
      try {
        params = new URL(url.replace('lifegate://', 'https://dummy.host/')).searchParams;
      } catch {
        return;
      }

      const status = params.get('status') ?? '';
      const txRef = params.get('tx_ref') ?? activeTxRef ?? '';
      const flwTxId = params.get('transaction_id') ?? params.get('flw_tx_id') ?? '';

      if (status === 'cancelled') {
        setShowVerifyPrompt(false);
        clearPaymentLink();
        setCancelledMsg(true);
        return;
      }

      if (status === 'failed') {
        setShowVerifyPrompt(false);
        clearPaymentLink();
        router.push({ pathname: '/(tab)/settings/payment-failed', params: { bundleId: selectedBundle ?? '' } });
        return;
      }

      // successful or dev shortcut
      setVerifying(true);
      setVerifyLabel('Confirming payment…');
      try {
        const tx = await verifyPayment(txRef, flwTxId);
        if (tx.status === 'success') {
          setShowVerifyPrompt(false);
          setVerifying(false);
          setVerifyLabel('');
          switchActiveChatToClinical();
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
      setVerifyLabel('');
      setShowVerifyPrompt(false);
      clearPaymentLink();
      router.push({ pathname: '/(tab)/settings/payment-failed', params: { bundleId: selectedBundle ?? '' } });
    },
    [activeTxRef, verifyPayment, clearPaymentLink, switchActiveChatToClinical, selectedBundle]
  );

  // Native path: listen for the deep-link URL when the external browser returns.
  useEffect(() => {
    if (isWeb) return;

    // Handle cold-start return from external browser.
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLinkVerify(url);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLinkVerify(url);
    });

    return () => sub.remove();
  }, [handleDeepLinkVerify]);

  // Native fallback: if app becomes active without deep-link callback,
  // auto-verify the last active tx reference.
  useEffect(() => {
    if (isWeb) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // Verify whenever there is an active tx reference — even if modal was
      // dismissed — so credits are credited after system-back from browser.
      if (!activeTxRef || verifying) return;
      if (!showVerifyPrompt) {
        // Modal was dismissed but payment may have completed. Re-show it
        // so the user sees verification in progress.
        setShowVerifyPrompt(true);
        setPaymentPageOpened(true);
      }
      handleWebVerify();
    });
    return () => sub.remove();
  }, [activeTxRef, verifying, showVerifyPrompt, handleWebVerify]);

  const displayBundles: CreditBundle[] = bundles;

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
              <Ionicons name="time-outline" size={20} color="#0EA5A4" />
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

          <View className="mb-4 rounded-2xl bg-[#E8F4F4] p-1 flex-row border border-[#D4ECEB]">
            {(['NGN', 'USD'] as const).map((option) => {
              const active = currency === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCurrency(option)}
                  className={`flex-1 rounded-xl px-4 py-3 ${active ? 'bg-white' : 'bg-transparent'}`}>
                  <Text
                    className={`text-center text-sm font-semibold ${active ? 'text-[#0EA5A4]' : 'text-gray-500'}`}>
                    {option === 'NGN' ? 'Pay in Naira' : 'Pay in USD'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-4 text-xs leading-5 text-gray-500">
            {currency === 'USD'
              ? 'USD prices are derived from the latest cached market FX rate.'
              : 'NGN prices are the base price for local card and bank payment options.'}
          </Text>

          {bundlesLoading && displayBundles.length === 0 ? (
            <View className="mb-4 items-center justify-center py-6">
              <ActivityIndicator color="#0EA5A4" size="small" />
              <Text className="mt-2 text-sm text-gray-500">Loading current bundle prices...</Text>
            </View>
          ) : null}

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
                  <Text className="text-xl font-black text-gray-900">
                    {currency === 'USD'
                      ? `$${bundle.amountUSD.toFixed(2)}`
                      : `₦${bundle.amountNaira.toLocaleString()}`}
                  </Text>
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
                <Text className="font-bold">
                  {currency === 'USD'
                    ? `$${selectedBundleData.amountUSD.toFixed(2)}`
                    : `₦${selectedBundleData.amountNaira.toLocaleString()}`}
                </Text>.
              </Text>
                {currency === 'USD' && (
                <Text className="text-xs text-gray-400 mt-1">
                    USD amount is derived from the latest cached FX rate.
                </Text>
              )}
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

      {/* Payment waiting modal — shown on all platforms after opening the external browser / payment tab */}
      <Modal
          visible={showVerifyPrompt}
          animationType="fade"
          transparent
          onRequestClose={() => {
            if (verifying) return;
            setShowVerifyPrompt(false);
            setPaymentPageOpened(false);
            setOpenPaymentError(null);
            clearPaymentLink();
          }}>
          <View className="flex-1 bg-black/50 items-center justify-center px-6">
            <View className="bg-white rounded-2xl p-6 w-full">
              <View className="items-center mb-4">
                <Ionicons name="open-outline" size={40} color="#0EA5A4" />
              </View>
              {/* Step 1 — not yet opened: show the Open button */}
              {!paymentPageOpened && !verifying ? (
                <>
                  <Text className="text-xl font-bold text-gray-900 text-center mb-2">Secure Checkout</Text>
                  <Text className="text-sm text-gray-600 text-center mb-6 leading-5">
                    Tap the button below to open the Flutterwave payment page in your browser.
                    Your credits will be added automatically once payment is complete.
                  </Text>
                  <Pressable
                    onPress={handleOpenPaymentPage}
                    className="rounded-xl py-4 items-center mb-3 bg-[#0EA5A4] flex-row justify-center gap-2">
                    <Ionicons name="open-outline" size={18} color="white" />
                    <Text className="text-base font-semibold text-white">Open Payment Page</Text>
                  </Pressable>
                  {openPaymentError ? (
                    <Text className="text-xs text-red-600 text-center mb-3">{openPaymentError}</Text>
                  ) : null}
                </>
              ) : (
                /* Step 2 — browser opened or verifying: show spinner */
                <>
                  <Text className="text-xl font-bold text-gray-900 text-center mb-2">
                    {verifying ? 'Confirming Payment' : 'Awaiting Payment'}
                  </Text>
                  <Text className="text-sm text-gray-600 text-center mb-5 leading-5">
                    {verifying
                      ? verifyLabel || 'Waiting for payment confirmation…'
                      : 'Complete your payment in the browser. Your credits will be added automatically.'}
                  </Text>
                  <View className="items-center py-3 mb-4">
                    <ActivityIndicator color="#0EA5A4" size="large" />
                    {!verifying && (
                      <Text className="text-xs text-gray-400 mt-2">Waiting for payment to complete…</Text>
                    )}
                  </View>
                  {!verifying && (
                    <Pressable
                      onPress={handleWebVerify}
                      className="rounded-xl py-3 items-center mb-3 border border-[#0EA5A4]">
                      <Text className="text-sm font-semibold text-[#0EA5A4]">Already paid? Confirm manually</Text>
                    </Pressable>
                  )}
                  {!verifying && (
                    <Pressable
                      onPress={handleOpenPaymentPage}
                      className="rounded-xl py-3 items-center mb-3 border border-gray-200">
                      <Text className="text-sm font-semibold text-gray-500">Re-open payment page</Text>
                    </Pressable>
                  )}
                  {openPaymentError ? (
                    <Text className="text-xs text-red-600 text-center mb-3">{openPaymentError}</Text>
                  ) : null}
                </>
              )}
              <Pressable
                onPress={() => {
                  if (verifying) return;
                  setShowVerifyPrompt(false);
                  setPaymentPageOpened(false);
                  setOpenPaymentError(null);
                  clearPaymentLink();
                }}
                className={`rounded-xl py-4 items-center border ${
                  verifying ? 'border-gray-100 opacity-40' : 'border-gray-200'
                }`}>
                <Text className="text-base font-semibold text-gray-600">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}
