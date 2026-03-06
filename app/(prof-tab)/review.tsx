import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useEffect, useRef } from 'react';
import { useReviewStore } from '../../stores/review-store';
import {
  ReviewHeader,
  ConsultationSummary,
  ActivityChart,
  ActivityList,
  SearchBar,
} from '../../components';

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
      {/* Header */}
      <ReviewHeader selectedDate={selectedDateRef.current} onDateChange={handleDateChange} />

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