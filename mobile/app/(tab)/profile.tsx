import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { useHealthStore } from 'stores/health-store';
import { useCheckinStore } from 'stores/checkin-store';
import { useOffersStore } from 'stores/offers-store';
import { useExploreStore } from 'stores/explore-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { PrimaryButton } from 'components/Button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import type { HealthTimelineEntry } from 'types/health-types';

// ─── Urgency config (mirrors health timeline) ─────────────────────────────────
type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const URGENCY = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', label: 'Low Risk'  },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', label: 'Moderate'  },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', label: 'High Risk' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', dot: '#a855f7', label: 'Critical'  },
} as const;

const URGENCY_RANK: Record<Urgency, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const URGENCY_LABEL: Record<string, string> = {
  LOW: 'Low Risk', MEDIUM: 'Moderate', HIGH: 'High Risk', CRITICAL: 'Critical',
};

function shortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// ─── Severity Line Chart ──────────────────────────────────────────────────────
function SeverityLineChart({ entries }: { entries: HealthTimelineEntry[] }) {
  const { width: screenW } = useWindowDimensions();
  const chartData = useMemo(() => [...entries].reverse().slice(-15), [entries]);

  if (chartData.length < 2) {
    return (
      <View style={{ height: 64, borderRadius: 14, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>Need at least 2 records to show chart</Text>
      </View>
    );
  }

  const PAD_LEFT = 42, PAD_RIGHT = 12, PAD_TOP = 12, PAD_BOTTOM = 28;
  const svgW = screenW - 64;
  const svgH = 160;
  const chartW = svgW - PAD_LEFT - PAD_RIGHT;
  const chartH = svgH - PAD_TOP - PAD_BOTTOM;
  const step = chartW / (chartData.length - 1);

  const dotColor = (u: string) => URGENCY[u as keyof typeof URGENCY]?.dot ?? '#9ca3af';

  const points = chartData.map((e, i) => {
    const rank = URGENCY_RANK[e.urgency as Urgency] ?? 1;
    return {
      x: PAD_LEFT + i * step,
      y: PAD_TOP + chartH - (rank / 4) * chartH,
      color: dotColor(e.urgency),
    };
  });

  const areaPath = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
    `L ${points[0].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
    'Z',
  ].join(' ');

  const yLevels = [
    { rank: 4, label: 'CRIT', color: URGENCY.CRITICAL.dot },
    { rank: 3, label: 'HIGH', color: URGENCY.HIGH.dot },
    { rank: 2, label: 'MED',  color: URGENCY.MEDIUM.dot },
    { rank: 1, label: 'LOW',  color: URGENCY.LOW.dot },
  ].map((l) => ({ ...l, y: PAD_TOP + chartH - (l.rank / 4) * chartH }));

  const xLabels = [0, Math.floor((chartData.length - 1) / 2), chartData.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => ({ x: PAD_LEFT + i * step, label: shortDate(chartData[i].createdAt) }));

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}>
      <Svg width={svgW} height={svgH}>
        {yLevels.map((l) => (
          <Line key={`g-${l.label}`} x1={PAD_LEFT} y1={l.y} x2={PAD_LEFT + chartW} y2={l.y} stroke="#f3f4f6" strokeWidth={1} />
        ))}
        {yLevels.map((l) => (
          <SvgText key={`yl-${l.label}`} x={PAD_LEFT - 5} y={l.y + 4} fontSize={9} fill={l.color} textAnchor="end" fontWeight="700">{l.label}</SvgText>
        ))}
        <Path d={areaPath} fill="rgba(10,173,162,0.07)" />
        {points.slice(1).map((p, i) => (
          <Line key={`s-${i}`} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} stroke={p.color} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {points.map((p, i) => (
          <React.Fragment key={`d-${i}`}>
            <Circle cx={p.x} cy={p.y} r={7} fill={p.color + '22'} />
            <Circle cx={p.x} cy={p.y} r={4} fill={p.color} stroke="#fff" strokeWidth={1.5} />
          </React.Fragment>
        ))}
        {xLabels.map((l, i) => (
          <SvgText key={`xl-${i}`} x={l.x} y={svgH - 6} fontSize={9} fill="#9ca3af" textAnchor="middle">{l.label}</SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 10, paddingTop: 2 }}>
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Urgency[]).map((u) => (
          <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: URGENCY[u].dot }} />
            <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '500' }}>{URGENCY_LABEL[u]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PatientProfileScreen() {
  const { user } = useAuthStore();
  const { loading, getProfile, error } = useProfileStore();
  const { patientTimeline, fetchPatientTimeline } = useHealthStore();
  const checkinCoins = useCheckinStore((s) => s.lifecoins);
  const offersCoins = useOffersStore((s) => s.lifecoins);
  const exploreCoins = useExploreStore((s) => s.lifecoins);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    getProfile();
    fetchPatientTimeline();
  }, [getProfile, fetchPatientTimeline]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([getProfile(), fetchPatientTimeline()]);
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

  // ── Derived values ──────────────────────────────────────────────────────────
  const profileFields = [
    user.name,
    user.email,
    user.phone,
    user.gender,
    user.dob,
    user.language,
    user.blood_type,
    user.genotype,
    user.allergies,
    user.emergency_contact,
  ];
  const profileCompletion = Math.round(
    (profileFields.filter((value) => !!String(value ?? '').trim()).length / profileFields.length) * 100
  );
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const initials =
    user.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'P';

  const age = (() => {
    if (!user.dob) return null;
    const birth = new Date(user.dob);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return a;
  })();

  const totalLifecoins = checkinCoins + offersCoins + exploreCoins;

  const criticalHealthFields = [
    { label: 'Blood type', value: user.blood_type },
    { label: 'Genotype', value: user.genotype },
    { label: 'Allergies', value: user.allergies },
    { label: 'Emergency contact', value: user.emergency_contact },
  ];
  const missingCritical = criticalHealthFields.filter((item) => !String(item.value ?? '').trim());

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
              <TouchableOpacity
                className="h-10 w-10 rounded-full bg-white items-center justify-center active:opacity-70"
                onPress={() => router.replace('/(tab)/health')}
              >
                <Ionicons name="arrow-back" size={20} color="#1A1A2E" />
              </TouchableOpacity>
              <Text className="flex-1 text-center text-2xl font-black text-gray-900 mr-10">
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
                  <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4]">
                    Welcome back
                  </Text>
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
              <View className="flex-row items-center mb-4 bg-gradient-to-r rounded-2xl overflow-hidden" style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
                {/* Left accent bar */}
                <View style={{ width: 4, backgroundColor: '#F59E0B', alignSelf: 'stretch' }} />
                <View className="flex-row items-center gap-3 px-4 py-3 flex-1">
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FDE68A' }}>
                    <Ionicons name="heart-circle" size={22} color="#F59E0B" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', letterSpacing: 0.6, textTransform: 'uppercase' }}>Total Lifecoins</Text>
                    <View className="flex-row items-baseline gap-1">
                      <Text style={{ fontSize: 26, fontWeight: '900', color: '#B45309', lineHeight: 30 }}>{totalLifecoins}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>coins</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#FDE68A' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>Earned</Text>
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
                <SeverityLineChart entries={patientTimeline} />
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
