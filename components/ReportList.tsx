import { View, Text, ScrollView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { ReportStatus } from '../types/professional-types';
import { PatientReportCard } from './PatientReportCard';

interface ReportListProps {
  reports: any[];
  selectedFilter: ReportStatus | 'All';
  onFilterChange: (filter: ReportStatus | 'All') => void;
  onReportPress?: (reportId: string) => void;
  loading?: boolean;
}

const FILTERS: (ReportStatus | 'All')[] = ['Pending', 'Active', 'Completed', 'All'];

export const ReportList = ({
  reports,
  selectedFilter,
  onFilterChange,
  onReportPress,
  loading = false,
}: ReportListProps) => {

  return (
    <View> 
      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-6 py-4"
        contentContainerStyle={{ gap: 2 }}
      >
        {FILTERS.map(filter => (
          <Pressable
            key={filter}
            onPress={() => onFilterChange(filter)}
            className={`px-4 py-2 border-b-2 ${
              selectedFilter === filter ? 'border-teal-600' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-sm ${
                selectedFilter === filter
                  ? 'text-teal-600 font-bold'
                  : 'text-gray-700 font-medium'
              }`}
            >
              {filter}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Reports list */}
      {loading ? (
        <ActivityIndicator size="large" color="#0AADA2" className="py-10" /> 
      ) : reports.length > 0 ? (
        <FlatList
          data={reports}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PatientReportCard
              report={item}
              onPress={() => onReportPress?.(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
          scrollEnabled={false}
          nestedScrollEnabled={false}
        />
      ) : (
        <View className="items-center px-6 pt-6">
          <Text className="text-gray-500 text-base text-center">No reports found</Text>
        </View>
      )}
    </View>
  );
};