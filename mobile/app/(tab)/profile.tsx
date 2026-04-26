import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
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

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    getProfile();
    fetchPatientTimeline();
    syncWallet();
    // Hydrate per-source stores so localTotal is accurate even if the user
    // hasn't visited those screens yet in this session.
    if (!checkinInitialized) initializeCheckin();
    if (!exploreInitialized) initializeExplore();
  }, [getProfile, fetchPatientTimeline, syncWallet, checkinInitialized, initializeCheckin, exploreInitialized, initializeExplore]);

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
    await Promise.all([getProfile(), fetchPatientTimeline(), syncWallet()]);
    setIsRefreshing(false);
    if (!user) {
      Alert.alert('Failed to Refresh', error || 'Could not fetch your profile. Please try again.', [
        { text: 'OK' },
      ]);
    }
  };

  if (loading && !user) return <ProfileSkeleton />;

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

              {/* Lifecoins */}
              <View className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
                {/* Main row */}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Left accent bar */}
                  <View style={{ width: 4, backgroundColor: '#F59E0B', alignSelf: 'stretch' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FDE68A' }}>
                      <Ionicons name="heart-circle" size={22} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', letterSpacing: 0.6, textTransform: 'uppercase' }}>Total Lifecoins</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Text style={{ fontSize: 26, fontWeight: '900', color: '#B45309', lineHeight: 30 }}>{totalLifecoins}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>coins</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push('/(tab)/health/redeem')}
                      style={{ backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>Redeem</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Completion bar */}
              <View className="mb-3">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Profile Completion
                  </Text>
                  <Text className="text-sm font-bold text-gray-800">{profileCompletion}%</Text>
                </View>
                <View className="h-2.5 rounded-full bg-[#E8F3F3] overflow-hidden">
                  <View className="h-2.5 rounded-full bg-[#0EA5A4]" style={{ width: `${profileCompletion}%` }} />
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
