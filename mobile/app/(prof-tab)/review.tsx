import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { useReviewStore } from '../../stores/review-store';
import {
  ConsultationSummary,
  ActivityChart,
  ActivityList,
  SearchBar,
} from '../../components';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatDateLabel = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function ReviewScreen() {
  const {
    fetchReviewAnalysis,
    fetchDateRangeAnalysis,
    refreshAnalysis,
    date: storeDate,
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
  const [rangeMode, setRangeMode] = useState<'day' | '7d' | '30d'>('7d');

  const loadData = useCallback((date: Date, mode: 'day' | '7d' | '30d') => {
    if (mode === 'day') {
      fetchReviewAnalysis(date);
    } else {
      const days = mode === '7d' ? 7 : 30;
      const end = new Date(date);
      const start = new Date(date);
      start.setDate(start.getDate() - days);
      fetchDateRangeAnalysis(start, end);
    }
  }, [fetchReviewAnalysis, fetchDateRangeAnalysis]);

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

  const handleRangeChange = (mode: 'day' | '7d' | '30d') => {
    setRangeMode(mode);
    loadData(selectedDate, mode);
  };

  const handleRefresh = useCallback(async () => {
    await refreshAnalysis();
  }, [refreshAnalysis]);

  const filteredActivities = searchQuery
    ? activities.filter(
        (a) =>
          a.condition.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.caseType.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activities;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView />
      {/* Header */}
      <View className="bg-white px-6 pt-2 pb-4 border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900 mb-3">Review Analysis</Text>

        {/* Range toggle */}
        <View className="flex-row bg-gray-100 rounded-lg p-1 mb-3">
          {(['day', '7d', '30d'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => handleRangeChange(mode)}
              className={`flex-1 py-1 rounded-md items-center ${rangeMode === mode ? 'bg-white' : ''}`}
              style={rangeMode === mode ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 } : {}}
            >
              <Text className={`text-xs font-semibold ${rangeMode === mode ? 'text-[#0EA5A4]' : 'text-gray-500'}`}>
                {mode === 'day' ? 'Today' : mode === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date navigation */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => shiftDate(-1)} className="p-2 rounded-full bg-gray-100">
            <Ionicons name="chevron-back" size={18} color="#0AADA2" />
          </Pressable>
          <Text className="text-sm font-medium text-gray-700">{formatDateLabel(selectedDate)}</Text>
          <Pressable
            onPress={() => shiftDate(1)}
            disabled={selectedDate >= new Date()}
            className="p-2 rounded-full bg-gray-100"
          >
            <Ionicons name="chevron-forward" size={18} color={selectedDate >= new Date() ? '#CBD5E1' : '#0AADA2'} />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <SearchBar
        placeholder="Search activities, conditions..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {/* Error state */}
      {error && !loading ? (
        <View className="mx-6 mt-4 flex-row items-start rounded-xl bg-red-50 p-3">
          <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
          <Text className="ml-2 flex-1 text-sm text-red-700">{error}</Text>
          <Pressable onPress={() => loadData(selectedDate, rangeMode)}>
            <Text className="text-sm font-semibold text-[#0EA5A4]">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Main Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="mt-3 text-sm text-gray-500">Loading analysis...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1 bg-gray-50"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0AADA2" />
          }
        >
          {/* Consultation Summary */}
          <ConsultationSummary
            totalReview={totalReview}
            pendingCases={pendingCases}
            activeCases={activeCases}
            completedCases={completedCases}
          />

          {/* Activity Chart */}
          <ActivityChart metrics={metrics} total={totalReview} />

          {/* Activity List */}
          <ActivityList
            activities={filteredActivities}
            onActivityPress={(activity) => console.log('Activity pressed:', activity)}
          />

          <View className="h-6" />
        </ScrollView>
      )}
    </View>
  );
}
