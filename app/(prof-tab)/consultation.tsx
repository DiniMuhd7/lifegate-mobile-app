import { View } from 'react-native';
import { useEffect } from 'react';
import { useProfessionalStore } from '../../stores/professional-store';
import {
  PhysicianHeader,
  SearchBar,
  ReportList,
} from '../../components';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ConsultationScreen() {
  const {
    fetchReports,
    searchReports,
    clearSearch,
    setFilter,
    filteredReports,
    selectedFilter,
    searchQuery,
    loading,
  } = useProfessionalStore();

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleReportPress = (reportId: string) => {
    // Navigate to report detail screen
    console.log('Report pressed:', reportId);
  };

  return (
    <SafeAreaView className='flex-1'>
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <PhysicianHeader />
      {/* Search Bar */}
      <SearchBar
        placeholder="Search..."
        value={searchQuery}
        onChangeText={searchReports}
        onClear={clearSearch}
      />
      {/* Reports List with Filtering */}
      <ReportList
        reports={filteredReports}
        selectedFilter={selectedFilter}
        onFilterChange={setFilter}
        onReportPress={handleReportPress}
        loading={loading}
      />
    </View>
    </SafeAreaView>
  );
}
