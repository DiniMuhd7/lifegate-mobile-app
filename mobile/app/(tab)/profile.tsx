import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { useHealthStore } from 'stores/health-store';
import { useCheckinStore } from 'stores/checkin-store';
import { useOffersStore } from 'stores/offers-store';
import { useExploreStore } from 'stores/explore-store';
import { useSurveyStore } from 'stores/survey-store';
import { useLifecoinsWalletStore } from 'stores/lifecoins-wallet-store';
import { usePaymentStore } from 'stores/payment-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { SeverityLineChart } from 'components/SeverityLineChart';
import { PrimaryButton } from 'components/Button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PatientProfileScreen() {
  // Scoped selectors — each component re-renders only when its specific slice changes.
  const user               = useAuthStore((s) => s.user);
  const loading            = useProfileStore((s) => s.loading);
  const getProfile         = useProfileStore((s) => s.getProfile);
  const error              = useProfileStore((s) => s.error);
  const patientTimeline    = useHealthStore((s) => s.patientTimeline);
  const fetchPatientTimeline = useHealthStore((s) => s.fetchPatientTimeline);
  const checkinCoins        = useCheckinStore((s) => s.lifecoins);
  const checkinInitialized  = useCheckinStore((s) => s.initialized);
  const initializeCheckin   = useCheckinStore((s) => s.initialize);
  const offersCoins         = useOffersStore((s) => s.lifecoins);
  const exploreCoins        = useExploreStore((s) => s.lifecoins);
  const exploreInitialized  = useExploreStore((s) => s.initialized);
  const initializeExplore   = useExploreStore((s) => s.initialize);
  const surveyCoins         = useSurveyStore((s) => s.totalCoinsEarned);
  const walletBalance       = useLifecoinsWalletStore((s) => s.balance);
  const syncWallet          = useLifecoinsWalletStore((s) => s.syncFromBackend);
  const walletTransactions  = useLifecoinsWalletStore((s) => s.transactions);
  const creditBalance       = usePaymentStore((s) => s.balance);
  const fetchCreditBalance  = usePaymentStore((s) => s.fetchBalance);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRedeemLock, setShowRedeemLock] = useState(false);

  useEffect(() => {
    getProfile();
    fetchPatientTimeline();
    syncWallet();
    fetchCreditBalance();
    // Hydrate per-source stores so localTotal is accurate even if the user
    // hasn't visited those screens yet in this session.
    if (!checkinInitialized) initializeCheckin();
    if (!exploreInitialized) initializeExplore();
  }, [getProfile, fetchPatientTimeline, syncWallet, fetchCreditBalance, checkinInitialized, initializeCheckin, exploreInitialized, initializeExplore]);

  // ── Derived values — memoized before early returns (Rules of Hooks) ─────────
  const profileCompletion = useMemo(() => {
    if (!user) return 0;
    const fields = [
      user.name, user.email, user.phone, user.gender, user.dob,
      user.language, user.blood_type, user.genotype, user.allergies, user.emergency_contact,
    ];
    return Math.round(
      (fields.filter((v) => !!String(v ?? '').trim()).length / fields.length) * 100,
    );
  }, [user]);

  const firstName = useMemo(() => user?.name?.split(' ')[0] || 'Patient', [user]);

  const initials = useMemo(
    () =>
      user?.name
        ?.split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || 'P',
    [user],
  );

  const age = useMemo(() => {
    if (!user?.dob) return null;
    const birth = new Date(user.dob);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return a;
  }, [user?.dob]);

  // localTotal sums all per-source persistent accumulators.
  const localTotal = checkinCoins + offersCoins + exploreCoins + surveyCoins;
  // Always take the higher of walletBalance and localTotal so that:
  // - walletBalance > localTotal: a redemption deducted but localTotal doesn't track that → use wallet
  // - localTotal > walletBalance: wallet missed some coins (e.g. persist race) → use localTotal
  const totalLifecoins = Math.max(walletBalance, localTotal);

  // Per-source earned breakdowns shown beneath the grand total.
  // Check-ins and Explore use their own persistent store accumulators (most
  // accurate). Referrals are awarded server-side, so we derive them from the
  // synced wallet transaction history.
  const referralEarned = useMemo(
    () =>
      walletTransactions
        .filter((t) => t.source === 'referral' && t.type === 'earn')
        .reduce((sum, t) => sum + t.coins, 0),
    [walletTransactions],
  );

  // criticalHealthFields folded in — one useMemo instead of two passes.
  const missingCritical = useMemo(() => {
    if (!user) return [];
    return [
      { label: 'Blood type',        value: user.blood_type },
      { label: 'Genotype',          value: user.genotype },
      { label: 'Allergies',         value: user.allergies },
      { label: 'Emergency contact', value: user.emergency_contact },
    ].filter((item) => !String(item.value ?? '').trim());
  }, [user]);
  // ────────────────────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([getProfile(), fetchPatientTimeline(), syncWallet(), fetchCreditBalance()]);
    setIsRefreshing(false);
    if (!user) {
      Alert.alert('Failed to Refresh', error || 'Could not fetch your profile. Please try again.', [
        { text: 'OK' },
      ]);
    }
  };

  if (loading && !user) return <ProfileSkeleton />;

  const redeemLockModal = (
    <Modal
      visible={showRedeemLock}
      transparent
      animationType="fade"
      onRequestClose={() => setShowRedeemLock(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 }}
        onPress={() => setShowRedeemLock(false)}
      >
        <Pressable
          style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', gap: 12 }}
          onPress={() => { /* swallow — prevent backdrop close on inner tap */ }}
        >
          {/* Icon */}
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <Ionicons name="lock-closed" size={28} color="#D97706" />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' }}>
            Redemption Locked
          </Text>

          <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 }}>
            You need at least{' '}
            <Text style={{ fontWeight: '800', color: '#D97706' }}>100 Lifecoins</Text>{' '}
            to redeem. You currently have{' '}
            <Text style={{ fontWeight: '800', color: '#B45309' }}>{totalLifecoins} LC</Text>.
          </Text>

          {/* Progress bar */}
          <View style={{ width: '100%', height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
            <View
              style={{
                height: '100%',
                width: `${Math.min((totalLifecoins / 100) * 100, 100)}%`,
                backgroundColor: totalLifecoins >= 75 ? '#F59E0B' : totalLifecoins >= 50 ? '#FCD34D' : '#FDE68A',
                borderRadius: 4,
              }}
            />
          </View>
          <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginTop: -4 }}>
            {totalLifecoins}/100 — {100 - totalLifecoins} more coins needed
          </Text>

          <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 }}>
            Earn Lifecoins by completing daily health check-ins, watching Explore videos, and referring friends.
          </Text>

          {/* CTA */}
          <TouchableOpacity
            onPress={() => setShowRedeemLock(false)}
            activeOpacity={0.85}
            style={{ marginTop: 4, backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F8F8] items-center justify-center">
        <View className="gap-4 items-center">
          <Text className="text-gray-600 text-center">Profile unavailable</Text>
          <PrimaryButton title="Retry" onPress={() => getProfile()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F8F8' }}>
      {redeemLockModal}
      <SafeAreaView className="flex-1 bg-[#F0F8F8]" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          <View className="px-4 pt-4 pb-3">
            <View className="flex-row items-center mb-3">
              <Text className="flex-1 text-center text-2xl font-black text-gray-900">
                Profile
              </Text>
            </View>

            {/* ── Bio card ── */}
            <View className="bg-white rounded-3xl p-5 shadow-sm border border-[#DCEFEF] overflow-hidden">
              <View className="absolute -top-6 -right-4 h-28 w-28 rounded-full bg-[#E4F6F6]" />
              <View className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-[#F2FBFB]" />

              <View className="flex-row items-center mb-4">
                <View className="h-16 w-16 rounded-full bg-[#DFF4F3] items-center justify-center mr-4 border-2 border-[#A9E4E2]">
                  <Text className="text-xl font-black text-[#0B8E8D]">{initials}</Text>
                  <View className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-[#10B981] border-2 border-white" />
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-black text-gray-900">{firstName}</Text>
                  <View className="flex-row items-center gap-3 mt-0.5">
                    {age !== null && (
                      <Text className="text-sm text-gray-500">{age} yrs</Text>
                    )}
                    {user.gender ? (
                      <Text className="text-sm text-gray-500">{user.gender}</Text>
                    ) : null}
                    {!age && !user.gender && (
                      <Text className="text-sm text-gray-400 italic">No age/gender set</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Lifecoins & Diagnosis Credits — side-by-side row */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>

                {/* — Lifecoins tile — */}
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', overflow: 'hidden' }}
                  onPress={() => {
                    if (totalLifecoins < 100) { setShowRedeemLock(true); return; }
                    router.push('/(tab)/health/redeem');
                  }}
                  activeOpacity={0.75}
                >
                  <View style={{ width: '100%', height: 3, backgroundColor: '#F59E0B' }} />
                  <View style={{ paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E', opacity: 0.7, marginBottom: 5 }}>Lifecoins</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="heart-circle" size={14} color="#F59E0B" />
                      </View>
                      <Text style={{ flex: 1, fontSize: 18, fontWeight: '900', color: '#B45309' }}>{totalLifecoins}</Text>
                      <Ionicons name="chevron-forward" size={13} color="#D97706" />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* — Diagnosis Credits tile — */}
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', overflow: 'hidden' }}
                  onPress={() => router.push('/(tab)/settings/subscription')}
                  activeOpacity={0.75}
                >
                  <View style={{ width: '100%', height: 3, backgroundColor: '#3B82F6' }} />
                  <View style={{ paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#1E3A5F', opacity: 0.7, marginBottom: 5 }}>Dx Credits</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="medical" size={13} color="#3B82F6" />
                      </View>
                      <Text style={{ flex: 1, fontSize: 18, fontWeight: '900', color: '#1D4ED8' }}>{creditBalance?.isPremium ? '∞' : (creditBalance?.balance ?? 0)}</Text>
                      <Ionicons name="chevron-forward" size={13} color="#2563EB" />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Completion bar */}
              <View className="mb-3">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Profile Completion
                  </Text>
                  <Text className="text-sm font-bold text-gray-800">{profileCompletion}%</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 h-2.5 rounded-full bg-[#E8F3F3] overflow-hidden">
                    <View className="h-2.5 rounded-full bg-[#0EA5A4]" style={{ width: `${profileCompletion}%` }} />
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push('/(tab)/health/report')}
                    activeOpacity={0.75}
                    style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#F1FAFA', borderWidth: 1, borderColor: '#CDE9E8', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="document-text-outline" size={20} color="#0EA5A4" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* ── Severity trend chart ── */}
          {patientTimeline.length > 0 && (
            <View className="px-4 pb-3">
              <View className="bg-white rounded-2xl p-4 shadow-sm border border-[#E7F0F0]">
                <View className="flex-row items-center gap-2 mb-3">
                  <Ionicons name="analytics-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Severity Trend</Text>
                  <Text className="text-xs text-gray-400 ml-auto">Last 15 cases</Text>
                </View>
                <SeverityLineChart entries={patientTimeline} widthOffset={64} />
              </View>
            </View>
          )}

          {/* ── Care Readiness ── */}
          <View className="px-4 pt-1 pb-1">
            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="medkit-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Care Readiness</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-full ${missingCritical.length === 0 ? 'bg-[#DCFCE7]' : 'bg-[#FEF3C7]'}`}>
                  <Text className={`text-xs font-bold ${missingCritical.length === 0 ? 'text-[#166534]' : 'text-[#92400E]'}`}>
                    {missingCritical.length === 0 ? 'Complete' : `${missingCritical.length} missing`}
                  </Text>
                </View>
              </View>

              <Text className="text-sm text-gray-600 leading-5 mb-3">
                {missingCritical.length === 0
                  ? 'Your critical safety details are complete for faster and safer triage.'
                  : `Add ${missingCritical.slice(0, 2).map((item) => item.label.toLowerCase()).join(' and ')} to improve diagnosis safety.`}
              </Text>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/manage-profile')}
                  className="flex-1 h-10 rounded-xl bg-[#0EA5A4] items-center justify-center active:opacity-80"
                >
                  <Text className="text-sm font-bold text-white">Update Health Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/notification')}
                  className="h-10 px-3 rounded-xl border border-[#CDE9E8] bg-[#F1FAFA] items-center justify-center active:opacity-80"
                >
                  <Ionicons name="notifications-outline" size={18} color="#0EA5A4" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Simulation Tests ── */}
          <View className="px-4 pt-2">
            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="flask-outline" size={18} color="#0EA5A4" />
                <Text className="text-lg font-black text-gray-900">Simulation Tests</Text>
              </View>
              <Text className="text-sm text-gray-600 leading-5 mb-3">
                Quick self-check tools to screen your vision and hearing. Results are not a medical diagnosis.
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/eyetest')}
                  className="flex-1 rounded-xl border border-[#CDE9E8] bg-[#F1FAFA] p-3 items-center active:opacity-75"
                >
                  <View className="h-9 w-9 rounded-full bg-[#E0F3F3] items-center justify-center mb-2">
                    <Ionicons name="eye-outline" size={20} color="#0EA5A4" />
                  </View>
                  <Text className="text-sm font-bold text-gray-800">Vision Test</Text>
                  <Text className="text-xs text-gray-500 mt-0.5 text-center">Acuity · Contrast · Color</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/hearingtest')}
                  className="flex-1 rounded-xl border border-[#CDE9E8] bg-[#F1FAFA] p-3 items-center active:opacity-75"
                >
                  <View className="h-9 w-9 rounded-full bg-[#E0F3F3] items-center justify-center mb-2">
                    <Ionicons name="ear-outline" size={20} color="#0EA5A4" />
                  </View>
                  <Text className="text-sm font-bold text-gray-800">Hearing Test</Text>
                  <Text className="text-xs text-gray-500 mt-0.5 text-center">PTA · HF · SIN</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <PatientBottomTabBar activeTab="profile" />
    </View>
  );
}
