import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../../stores/auth/auth-store';
import { useReviewStore } from '../../stores/review-store';
import {
  ConsultationSummary,
  ActivityChart,
  ActivityList,
  SearchBar,
} from '../../components';

const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const RANGE_LABELS = { day: 'Today', '7d': '7 Days', '30d': '30 Days' } as const;
type RangeMode = keyof typeof RANGE_LABELS;

export default function ReviewScreen() {
  const { user } = useAuthStore();
  const physicianName = user?.name?.split(' ')[0] || 'Doctor';

  const {
    fetchReviewAnalysis,
    fetchDateRangeAnalysis,
    refreshAnalysis,
    totalReview,
    pendingCases,
    activeCases,
    completedCases,
    activities,
    metrics,
    loading,
    refreshing,
    error,
  } = useReviewStore();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('7d');

  const loadData = useCallback(
    (date: Date, mode: RangeMode) => {
      if (mode === 'day') {
        fetchReviewAnalysis(date);
      } else {
        const days = mode === '7d' ? 7 : 30;
        const end = new Date(date);
        const start = new Date(date);
        start.setDate(start.getDate() - days);
        fetchDateRangeAnalysis(start, end);
      }
    },
    [fetchReviewAnalysis, fetchDateRangeAnalysis],
  );

  useEffect(() => {
    loadData(selectedDate, rangeMode);
  }, []);

  const shiftDate = (direction: -1 | 1) => {
    const newDate = new Date(selectedDate);
    const delta = rangeMode === '30d' ? 30 : rangeMode === '7d' ? 7 : 1;
    newDate.setDate(newDate.getDate() + direction * delta);
    setSelectedDate(newDate);
    loadData(newDate, rangeMode);
  };

  const handleRangeChange = (mode: RangeMode) => {
    setRangeMode(mode);
    loadData(selectedDate, mode);
  };

  const handleRefresh = useCallback(async () => {
    await refreshAnalysis();
  }, [refreshAnalysis]);

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const filteredActivities = searchQuery
    ? activities.filter(
        (a) =>
          a.condition?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.patientId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.caseType?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : activities;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']}>
        {/* ── Gradient Header ─────────────────────────────── */}
        <LinearGradient
          colors={['#0AADA2', '#043B3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="px-5 pb-5 pt-3"
        >
          {/* Top row */}
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-white/70 text-xs font-medium">Review Analysis</Text>
              <Text className="text-white text-xl font-bold mt-0.5">Dr. {physicianName}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => loadData(selectedDate, rangeMode)}
                className="w-9 h-9 rounded-full bg-white/15 items-center justify-center"
              >
                <Ionicons name="refresh-outline" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Range toggle */}
          <View className="flex-row bg-white/10 rounded-xl p-1 mb-3">
            {(Object.keys(RANGE_LABELS) as RangeMode[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => handleRangeChange(mode)}
                className="flex-1 py-1.5 rounded-lg items-center"
                style={
                  rangeMode === mode
                    ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                    : undefined
                }
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: rangeMode === mode ? '#fff' : 'rgba(255,255,255,0.55)' }}
                >
                  {RANGE_LABELS[mode]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Date navigation */}
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => shiftDate(-1)}
              className="w-8 h-8 rounded-full bg-white/15 items-center justify-center"
            >
              <Ionicons name="chevron-back" size={16} color="#fff" />
            </Pressable>

            <View className="flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text className="text-white text-sm font-semibold">
                {formatDateLabel(selectedDate)}
              </Text>
            </View>

            <Pressable
              onPress={() => shiftDate(1)}
              disabled={isToday}
              className="w-8 h-8 rounded-full bg-white/15 items-center justify-center"
              style={{ opacity: isToday ? 0.3 : 1 }}
            >
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* ── Search ─────────────────────────────────────────── */}
      <SearchBar
        placeholder="Search patients, conditions, case type…"
        value={searchQuery}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {/* ── Error banner ────────────────────────────────────── */}
      {error && !loading ? (
        <View className="mx-5 mb-2 flex-row items-center rounded-xl bg-red-50 px-4 py-3">
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
          <Text className="ml-2 flex-1 text-xs text-red-700">{error}</Text>
          <Pressable onPress={() => loadData(selectedDate, rangeMode)}>
            <Text className="text-xs font-bold text-[#0EA5A4]">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="text-sm text-gray-400">Loading analysis…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0AADA2"
              colors={['#0AADA2']}
            />
          }
        >
          <ConsultationSummary
            totalReview={totalReview}
            pendingCases={pendingCases}
            activeCases={activeCases}
            completedCases={completedCases}
          />

          <ActivityChart metrics={metrics} total={totalReview} />

          <ActivityList
            activities={filteredActivities}
            onActivityPress={(activity) => {
              // handled inside ActivityList via detail modal
              void activity;
            }}
          />

          <View className="h-8" />
        </ScrollView>
      )}
    </View>
  );
}

