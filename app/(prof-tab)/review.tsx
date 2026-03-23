import { View,Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useReviewStore } from '../../stores/review-store';
import {
  ConsultationSummary,
  ActivityChart,
  ActivityList,
  SearchBar,
} from '../../components';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReviewScreen() {
  const {
    fetchReviewAnalysis,
    date: storeDate,
    totalReview,
    pendingCases,
    activeCases,
    completedCases,
    activities,
    metrics,
    loading,
  } = useReviewStore();

  const selectedDateRef = useRef(new Date());

  // Fetch data when component mounts
  useEffect(() => {
    fetchReviewAnalysis(selectedDateRef.current);
  }, []); // Empty dependency array - only run once on mount

  const handleDateChange = (date: Date) => {
    selectedDateRef.current = date;
    // Always fetch new data when date changes
    fetchReviewAnalysis(date);
  };

  const handleActivityPress = (activity: any) => {
    console.log('Activity pressed:', activity);
    // Navigate to activity details if needed
  };

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView />
      {/* Header */}
      <View className="border-b border-gray-200 bg-white px-6 py-4">
        <View className="flex-row items-center">
          <Pressable className="-ml-2 p-2" onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#0AADA2" />
          </Pressable>
          <Text className="flex-1 text-2xl font-bold text-gray-900">Review Analysis</Text>
        </View>
      </View>
      
      {/* Search Bar */}
      <SearchBar
        placeholder="Search activities..."
        value=""
        onChangeText={() => {}}
        onClear={() => {}}
      />

      {/* Main Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0AADA2" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} className="flex-1 bg-gray-50">
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
          <ActivityList activities={activities} onActivityPress={handleActivityPress} />
        </ScrollView>
      )}
    </View>
  );
}
