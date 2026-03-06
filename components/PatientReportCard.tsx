import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PatientReport } from '../types/professional-types';

interface PatientReportCardProps {
  report: PatientReport;
  onPress?: () => void;
}

export const PatientReportCard = ({ report, onPress }: PatientReportCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      // case 'Pending':
      //   return '#FF9800';
      // case 'Active':
      //   return '#0AADA2';
      // case 'Completed':
      //   return '#4CAF50';
      default:
        return "#0d9488";
    }
  };

  return (
    <Pressable
      onPress={onPress}
      className="mx-6 mb-4 bg-white rounded-lg overflow-hidden border border-gray-100"
    >
      <View className="flex-row">
        {/* Status bar on left */}
        <View
          style={{
            width: 5,
            backgroundColor: getStatusColor(report.status),
          }}
        />

        {/* Patient ID and time badge */}
        <View
          style={{
            backgroundColor: getStatusColor(report.status),
            paddingHorizontal: 16,
            paddingVertical: 12,
            justifyContent: 'center',
            width: 100,
          }}
        >
          <Text className="text-white text-xs font-bold">Patient ID</Text>
          <Text className="text-white text-sm font-bold mt-1">{report.patientId}</Text>
          <Text className="text-white text-xs mt-2 opacity-75">{report.timestamp}</Text>
        </View>

        {/* Content */}
        <View className="flex-1 px-4 py-3 justify-between">
          <View>
            <Text className="text-teal-600 text-sm font-semibold">{report.reportType}</Text>
            <Text className="text-gray-800 text-sm font-medium mt-1 line-clamp-2">
              {report.title}
            </Text>
          </View>
          <Text className="text-gray-500 text-xs mt-2">{report.description}</Text>
        </View>

        {/* Arrow icon */}
        <View className="justify-center pr-4">
          <Ionicons name="chevron-forward" size={24} color="#9E9E9E" />
        </View>
      </View>
    </Pressable>
  );
};
