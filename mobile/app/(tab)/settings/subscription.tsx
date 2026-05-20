import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { openExternalUrl } from '@/utils/external-link';

const isWeb = Platform.OS === 'web';
const CALLBACK_PREFIX = 'lifegate://payment/callback';
const DEV_PREFIX = 'lifegate://payment/dev';

// ── Premium benefit list ──────────────────────────────────────────────────────
const PREMIUM_BENEFITS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'infinite-outline',           text: 'Unlimited AI Diagnosis Credits' },
  { icon: 'remove-circle-outline',      text: 'No Ads — completely ad-free experience' },
  { icon: 'flash-outline',              text: 'Priority Physician Queue (target <30 min)' },
  { icon: 'star-outline',               text: '2× LifeCoins earn rate on all activities' },
  { icon: 'scan-outline',               text: 'Unlimited medical document scans' },
  { icon: 'cloud-outline',              text: 'Unlimited chat & diagnosis history' },
  { icon: 'document-text-outline',      text: 'Full health report PDF export' },
  { icon: 'play-circle-outline',        text: 'Exclusive Premium Explore content' },
  { icon: 'headset-outline',            text: 'Dedicated support channel (4-hour SLA)' },
];


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
  // Premium billing cycle toggle
  const [premiumCycle, setPremiumCycle] = useState<'monthly' | 'annual'>('monthly');
  // Native: true once the user has tapped "Open Payment Page" in the modal
  const [paymentPageOpened, setPaymentPageOpened] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // 0 = not started; positive = polling phase step; negative = fallback verify step
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  // Label shown in the modal during verification
  const [verifyLabel, setVerifyLabel] = useState('');
  const [openPaymentError, setOpenPaymentError] = useState<string | null>(null);
  // Currency selection modal shown when the user taps "Upgrade to Premium"
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

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

      return openExternalUrl(normalized);
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

  // Separate premium subscription plans from pay-per-use credit packages.
  const creditBundles  = useMemo(() => displayBundles.filter((b) => !b.isPremium), [displayBundles]);
  const premiumBundles = useMemo(() => displayBundles.filter((b) => b.isPremium), [displayBundles]);
  // The active premium bundle based on the billing cycle toggle.
  const activePremiumBundle = useMemo(
    () => premiumBundles.find((b) => b.billingCycle === premiumCycle) ?? premiumBundles[0] ?? null,
    [premiumBundles, premiumCycle],
  );

  const selectedBundleData = displayBundles.find((bundle) => bundle.id === selectedBundle);

  type BenefitItem = { icon: React.ComponentProps<typeof Ionicons>['name']; text: string };

  /** Returns the full list of benefits for a bundle based on its tier. */
  function bundleBenefits(credits: number, idx: number, totalBundles: number): BenefitItem[] {
    const isFirst = idx === 0;
    const isLast = idx === totalBundles - 1;

    const base: BenefitItem[] = [
      { icon: 'pulse-outline',            text: 'AI-powered symptom triage per session' },
      { icon: 'medical-outline',          text: 'Licensed physician case review' },
      { icon: 'document-text-outline',    text: 'Diagnosis report & care recommendations' },
    ];

    if (credits === 1) {
      return [
        ...base,
        { icon: 'flash-outline',          text: 'Single-use — buy more anytime' },
      ];
    }
    if (isFirst) {
      return [
        ...base,
        { icon: 'wallet-outline',         text: `${credits} sessions for occasional consultations` },
        { icon: 'infinite-outline',       text: 'Credits never expire' },
      ];
    }
    if (isLast) {
      return [
        ...base,
        { icon: 'diamond-outline',        text: `${credits} sessions at the lowest per-credit rate` },
        { icon: 'people-outline',         text: 'Ideal for ongoing or chronic care' },
        { icon: 'infinite-outline',       text: 'Credits never expire' },
        { icon: 'shield-checkmark-outline', text: 'Priority case handling' },
      ];
    }
    return [
      ...base,
      { icon: 'calendar-outline',         text: `${credits} sessions — covers regular monthly check-ins` },
      { icon: 'infinite-outline',         text: 'Credits never expire' },
    ];
  }

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

        <ScrollView className="flex-1 px-4 pt-1" contentContainerStyle={{ paddingBottom: 20 }}>

          {/* ── Current Balance ─────────────────────────────────────────── */}
          <View className="mb-4 rounded-3xl bg-white border border-[#D9EEEE] p-5 overflow-hidden">
            <View className="absolute -top-8 -right-6 h-28 w-28 rounded-full bg-[#E7F8F7]" />
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">
              Current Balance
            </Text>
            <Text className="text-5xl font-black text-[#0EA5A4]">
              {balance?.isPremium ? '∞' : (balance?.balance ?? 0)}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              {balance?.isPremium ? 'Unlimited — Premium active' : 'credits available for diagnosis sessions'}
            </Text>
          </View>

          {/* ── Free trial nudge ─────────────────────────────────────────── */}
          {(balance?.balance ?? 0) > 0 &&
            (balance?.balance ?? 0) <= 3 &&
            transactions.length > 0 &&
            transactions.every((t) => t.bundleId === 'trial') && (
            <View className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex-row items-start gap-3">
              <Ionicons name="gift-outline" size={20} color="#b45309" style={{ marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-amber-800">Using your 10 free trial credits</Text>
                <Text className="text-xs text-amber-700 mt-0.5 leading-4">
                  Each clinical diagnosis session costs 1 credit. Subscribe to Premium for unlimited sessions.
                </Text>
              </View>
            </View>
          )}

          {/* ── Transactions link ────────────────────────────────────────── */}
          <View className="mb-5 flex-row items-center justify-between">
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

          {/* ════════════════════════════════════════════════════════════════
              TIER 1: Free Trial
          ════════════════════════════════════════════════════════════════ */}
          <View className="mb-2 flex-row items-center gap-2">
            <View className="h-px flex-1 bg-[#D9EEEE]" />
            <Text className="text-xs font-bold uppercase tracking-wider text-[#0EA5A4]">Free Trial</Text>
            <View className="h-px flex-1 bg-[#D9EEEE]" />
          </View>

          <View className="mb-5 rounded-2xl border border-[#D9EEEE] bg-white p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-2">
                <View className="w-8 h-8 rounded-lg bg-[#E7F8F7] items-center justify-center">
                  <Ionicons name="gift-outline" size={18} color="#0EA5A4" />
                </View>
                <Text className="text-base font-bold text-gray-900">New Account</Text>
              </View>
              <View className="px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]">
                <Text className="text-[11px] font-semibold text-[#047857]">Free</Text>
              </View>
            </View>
            <Text className="text-2xl font-black text-[#0EA5A4] mb-0.5">10 Dx Credits</Text>
            <Text className="text-xs text-gray-500 mb-3">Awarded automatically on sign-up · one-time</Text>
            {[
              { icon: 'pulse-outline' as const,           text: 'AI-powered symptom triage' },
              { icon: 'medical-outline' as const,         text: 'Licensed physician case review' },
              { icon: 'document-text-outline' as const,   text: 'Diagnosis report & recommendations' },
              { icon: 'infinite-outline' as const,        text: 'Credits never expire' },
            ].map((b, i) => (
              <View key={i} className="flex-row items-center gap-2 mb-1">
                <Ionicons name={b.icon} size={13} color="#0EA5A4" />
                <Text className="text-sm text-gray-600">{b.text}</Text>
              </View>
            ))}
          </View>

          {/* ════════════════════════════════════════════════════════════════
              TIER 2: LifeGate Premium
          ════════════════════════════════════════════════════════════════ */}
          <View className="mb-2 flex-row items-center gap-2">
            <View className="h-px flex-1 bg-[#D9EEEE]" />
            <Text className="text-xs font-bold uppercase tracking-wider text-[#0EA5A4]">LifeGate Premium</Text>
            <View className="h-px flex-1 bg-[#D9EEEE]" />
          </View>

          <View className="mb-5 rounded-2xl border-2 border-[#0EA5A4] bg-white overflow-hidden">
            {/* Header gradient bar */}
            <View className="bg-[#0EA5A4] px-4 py-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Ionicons name="diamond-outline" size={16} color="white" />
                <Text className="text-sm font-bold text-white">LifeGate Premium</Text>
              </View>
              <View className="px-2 py-0.5 rounded-full bg-white/20">
                <Text className="text-[10px] font-bold text-white uppercase tracking-wide">Most Popular</Text>
              </View>
            </View>

            <View className="p-4">
              {/* Billing cycle toggle */}
              <View className="mb-4 rounded-xl bg-[#E8F4F4] p-1 flex-row border border-[#D4ECEB]">
                {(['monthly', 'annual'] as const).map((cycle) => {
                  const active = premiumCycle === cycle;
                  return (
                    <Pressable
                      key={cycle}
                      onPress={() => setPremiumCycle(cycle)}
                      className={`flex-1 rounded-lg px-3 py-2.5 ${active ? 'bg-white' : 'bg-transparent'}`}>
                      <Text className={`text-center text-sm font-semibold ${active ? 'text-[#0EA5A4]' : 'text-gray-500'}`}>
                        {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                      </Text>
                      {cycle === 'annual' && (
                        <Text className={`text-center text-[10px] font-semibold mt-0.5 ${active ? 'text-[#047857]' : 'text-gray-400'}`}>
                          Save ₦10,000
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Price display */}
              {bundlesLoading && premiumBundles.length === 0 ? (
                <ActivityIndicator color="#0EA5A4" style={{ marginBottom: 12 }} />
              ) : activePremiumBundle ? (
                <View className="mb-4">
                  <Text className="text-3xl font-black text-gray-900">
                    {currency === 'USD'
                      ? `$${activePremiumBundle.amountUSD.toFixed(2)}`
                      : `₦${activePremiumBundle.amountNaira.toLocaleString()}`}
                    <Text className="text-base font-medium text-gray-500">
                      {premiumCycle === 'monthly' ? '/month' : '/year'}
                    </Text>
                  </Text>
                  {premiumCycle === 'annual' && (
                    <Text className="text-xs text-[#047857] font-semibold mt-1">
                      ₦10,000 saved vs. monthly billing
                    </Text>
                  )}
                </View>
              ) : null}

              {/* Benefit list */}
              <View className="mb-4 gap-2">
                {PREMIUM_BENEFITS.map((b, i) => (
                  <View key={i} className="flex-row items-center gap-2.5">
                    <View className="w-5 h-5 rounded-full bg-[#E7F8F7] items-center justify-center flex-shrink-0">
                      <Ionicons name={b.icon} size={11} color="#0EA5A4" />
                    </View>
                    <Text className="flex-1 text-sm text-gray-700 leading-5">{b.text}</Text>
                  </View>
                ))}
              </View>

              {/* Upgrade CTA */}
              <Pressable
                disabled={!activePremiumBundle || paymentLoading}
                onPress={() => {
                  if (!activePremiumBundle) return;
                  setShowCurrencyModal(true);
                }}
                className={`rounded-xl py-4 items-center flex-row justify-center gap-2 ${
                  activePremiumBundle && !paymentLoading ? 'bg-[#0EA5A4]' : 'bg-gray-300'
                }`}>
                {paymentLoading && selectedBundle?.startsWith('premium') ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Ionicons name="diamond-outline" size={18} color="white" />
                    <Text className="text-base font-bold text-white">Upgrade to Premium</Text>
                  </>
                )}
              </Pressable>

              <Text className="text-center text-xs text-gray-400 mt-2">
                Billed securely via Flutterwave · Cancel anytime
              </Text>
            </View>
          </View>

          {/* ════════════════════════════════════════════════════════════════
              TIER 3: Pay-Per-Use Credit Packages
          ════════════════════════════════════════════════════════════════ */}
          <View className="mb-2 flex-row items-center gap-2">
            <View className="h-px flex-1 bg-[#D9EEEE]" />
            <Text className="text-xs font-bold uppercase tracking-wider text-[#0EA5A4]">Pay-Per-Use Credits</Text>
            <View className="h-px flex-1 bg-[#D9EEEE]" />
          </View>

          <Text className="mb-3 text-xs text-gray-500 leading-5">
            One-time credit packages — no subscription. Credits never expire.
          </Text>

          {/* Currency toggle */}
          <View className="mb-4 rounded-2xl bg-[#E8F4F4] p-1 flex-row border border-[#D4ECEB]">
            {(['NGN', 'USD'] as const).map((option) => {
              const active = currency === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCurrency(option)}
                  className={`flex-1 rounded-xl px-4 py-3 ${active ? 'bg-white' : 'bg-transparent'}`}>
                  <Text className={`text-center text-sm font-semibold ${active ? 'text-[#0EA5A4]' : 'text-gray-500'}`}>
                    {option === 'NGN' ? 'Pay in Naira' : 'Pay in USD'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {bundlesLoading && creditBundles.length === 0 ? (
            <View className="mb-4 items-center justify-center py-6">
              <ActivityIndicator color="#0EA5A4" size="small" />
              <Text className="mt-2 text-sm text-gray-500">Loading packages…</Text>
            </View>
          ) : null}

          {creditBundles.map((bundle, idx) => {
            const selected = selectedBundle === bundle.id;
            const isValue  = idx === creditBundles.length - 1;
            const perCredit = bundle.amountNaira / bundle.credits;
            return (
              <Pressable
                key={bundle.id}
                onPress={() => setSelectedBundle(selected ? null : bundle.id)}
                className={`mb-3 rounded-2xl border-2 p-4 bg-white ${
                  selected ? 'border-[#0EA5A4]' : 'border-[#DCEEEE]'
                }`}>
                <View className="flex-row items-center justify-between mb-1">
                  {/* Bundle name badge */}
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-black text-gray-900">{bundle.name ?? bundle.credits + ' Credits'}</Text>
                    {isValue && (
                      <View className="px-2 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]">
                        <Text className="text-[10px] font-bold text-[#047857]">Best value</Text>
                      </View>
                    )}
                  </View>
                  {/* Selection checkbox */}
                  <View className={`h-6 w-6 rounded border-2 items-center justify-center ${
                    selected ? 'border-[#0EA5A4] bg-[#0EA5A4]' : 'border-[#0EA5A4] bg-transparent'
                  }`}>
                    {selected ? <Ionicons name="checkmark" size={14} color="white" /> : null}
                  </View>
                </View>

                <View className="flex-row items-baseline gap-2 mb-1">
                  <Text className="text-2xl font-black text-[#0EA5A4]">
                    {bundle.credits} Dx Credits
                  </Text>
                </View>

                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-lg font-bold text-gray-900">
                    {currency === 'USD' ? `$${bundle.amountUSD.toFixed(2)}` : `₦${bundle.amountNaira.toLocaleString()}`}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    ₦{perCredit.toLocaleString()} per credit
                  </Text>
                </View>

                <View className="gap-1">
                  {bundleBenefits(bundle.credits, idx, creditBundles.length).map((benefit, bIdx) => (
                    <View key={bIdx} className="flex-row items-center gap-2">
                      <Ionicons name={benefit.icon} size={13} color="#0EA5A4" />
                      <Text className="flex-1 text-sm text-gray-600 leading-5">{benefit.text}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}

          {/* Selected bundle summary */}
          {selectedBundleData && !selectedBundleData.isPremium ? (
            <View className="mb-3 rounded-xl bg-[#EEF8F8] border border-[#D4ECEB] px-4 py-3">
              <Text className="text-sm text-gray-700">
                You selected <Text className="font-bold">{selectedBundleData.name} ({selectedBundleData.credits} credits)</Text> for{' '}
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
            disabled={!selectedBundle || selectedBundleData?.isPremium || paymentLoading}
            onPress={handleBuyCredits}
            className={`rounded-xl py-4 items-center mb-4 flex-row justify-center gap-2 ${
              selectedBundle && !selectedBundleData?.isPremium && !paymentLoading ? 'bg-[#0EA5A4]' : 'bg-gray-300'
            }`}>
            {paymentLoading && !selectedBundle?.startsWith('premium') ? (
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

      {/* Currency selection modal — shown when user taps "Upgrade to Premium" */}
      <Modal
        visible={showCurrencyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCurrencyModal(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <Pressable className="flex-1" onPress={() => setShowCurrencyModal(false)} />
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            {/* Handle bar */}
            <View className="w-10 h-1 rounded-full bg-gray-200 self-center mb-5" />

            <Text className="text-xl font-black text-gray-900 mb-1">Choose Currency</Text>
            <Text className="text-sm text-gray-500 mb-6">
              Select how you'd like to pay for{' '}
              {premiumCycle === 'monthly' ? 'monthly' : 'annual'} Premium
            </Text>

            {/* Pay in Naira */}
            <Pressable
              onPress={() => {
                setShowCurrencyModal(false);
                if (!activePremiumBundle) return;
                setSelectedBundle(activePremiumBundle.id);
                initiatePayment(activePremiumBundle.id, user?.name ?? undefined, 'NGN');
              }}
              className="mb-3 rounded-2xl border-2 border-[#0EA5A4] bg-[#F0FAFA] p-4 flex-row items-center justify-between active:opacity-80">
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-full bg-[#E7F8F7] items-center justify-center">
                  <Text className="text-xl">🇳🇬</Text>
                </View>
                <View>
                  <Text className="text-base font-bold text-gray-900">Pay in Naira</Text>
                  <Text className="text-sm text-gray-500">Nigerian Naira · NGN</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-lg font-black text-[#0EA5A4]">
                  {activePremiumBundle ? `₦${activePremiumBundle.amountNaira.toLocaleString()}` : '—'}
                </Text>
                <Text className="text-xs text-gray-400">/{premiumCycle === 'monthly' ? 'month' : 'year'}</Text>
              </View>
            </Pressable>

            {/* Pay in USD */}
            <Pressable
              onPress={() => {
                setShowCurrencyModal(false);
                if (!activePremiumBundle) return;
                setSelectedBundle(activePremiumBundle.id);
                initiatePayment(activePremiumBundle.id, user?.name ?? undefined, 'USD');
              }}
              className="mb-6 rounded-2xl border-2 border-[#D4ECEB] bg-white p-4 flex-row items-center justify-between active:opacity-80">
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center">
                  <Text className="text-xl">🇺🇸</Text>
                </View>
                <View>
                  <Text className="text-base font-bold text-gray-900">Pay in USD</Text>
                  <Text className="text-sm text-gray-500">US Dollar · USD</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-lg font-black text-gray-900">
                  {activePremiumBundle ? `$${activePremiumBundle.amountUSD.toFixed(2)}` : '—'}
                </Text>
                <Text className="text-xs text-gray-400">/{premiumCycle === 'monthly' ? 'month' : 'year'}</Text>
              </View>
            </Pressable>

            {/* Cancel */}
            <Pressable
              onPress={() => setShowCurrencyModal(false)}
              className="rounded-xl py-4 items-center border border-gray-200">
              <Text className="text-base font-semibold text-gray-600">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
