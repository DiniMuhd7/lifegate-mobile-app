import { View, Text, TouchableOpacity } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useProfessionalStore } from '../../stores/professional-store';
import { useAuthStore } from '../../stores/auth/auth-store';
import {
  PhysicianHeader,
  SearchBar,
  ReportList,
} from '../../components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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

  const user = useAuthStore((s) => s.user);
  const mdcnVerified = user?.mdcn_verified ?? false;

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleReportPress = (reportId: string) => {
    console.log('Report pressed:', reportId);
  };

  return (
    <SafeAreaView className='flex-1'>
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <PhysicianHeader />

      {/* MDCN verification pending banner */}
      {!mdcnVerified && (
        <TouchableOpacity
          onPress={() => router.push('/(auth)/mdcn-verify')}
          activeOpacity={0.85}
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            marginBottom: 4,
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#fef3c7',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="shield-outline" size={18} color="#b45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>
              MDCN License Pending
            </Text>
            <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2, lineHeight: 17 }}>
              Complete your MDCN portal verification to unlock full access. Tap to verify →
            </Text>
          </View>
        </TouchableOpacity>
      )}

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
