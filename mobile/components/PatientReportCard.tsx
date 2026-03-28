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
      case 'Pending': return '#F59E0B';
      case 'Active': return '#3B82F6';
      case 'Completed': return '#10B981';
      default: return '#0d9488';
    }
  };

  const getUrgencyBadgeStyle = (urgency: string) => {
    switch (urgency?.toUpperCase()) {
      case 'CRITICAL': return { bg: '#FEE2E2', text: '#B91C1C' };
      case 'HIGH': return { bg: '#FFEDD5', text: '#C2410C' };
      case 'MEDIUM': return { bg: '#FEF9C3', text: '#A16207' };
      case 'LOW': return { bg: '#DCFCE7', text: '#15803D' };
      default: return { bg: '#F3F4F6', text: '#6B7280' };
    }
  };

  const statusColor = getStatusColor(report.status);
  const urgencyStyle = getUrgencyBadgeStyle(report.reportType);

  return (
    <Pressable
      onPress={onPress}
      className="mx-6 mb-4 bg-white rounded-xl overflow-hidden border border-gray-100"
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}
    >
      <View className="flex-row">
        {/* Status bar on left */}
        <View style={{ width: 4, backgroundColor: statusColor }} />

        {/* Patient ID badge */}
        <View
          style={{ backgroundColor: statusColor + '18', paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', width: 96 }}
        >
          <Text style={{ color: statusColor }} className="text-xs font-bold">Patient</Text>
          <Text style={{ color: statusColor }} className="text-sm font-bold mt-0.5" numberOfLines={1}>{report.patientId}</Text>
          <View style={{ backgroundColor: statusColor + '30', alignSelf: 'flex-start' }} className="mt-1.5 px-1.5 py-0.5 rounded-full">
            <Text style={{ color: statusColor }} className="text-xs font-semibold">{report.status}</Text>
          </View>
        </View>

        {/* Content */}
        <View className="flex-1 px-3 py-3 justify-between">
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              {report.patientName ? (
                <Text className="text-gray-900 text-sm font-semibold" numberOfLines={1}>{report.patientName}</Text>
              ) : null}
              <Text className="text-gray-600 text-xs mt-0.5" numberOfLines={2}>{report.title || report.description}</Text>
            </View>
            {report.reportType ? (
              <View style={{ backgroundColor: urgencyStyle.bg }} className="ml-2 px-2 py-0.5 rounded-full">
                <Text style={{ color: urgencyStyle.text }} className="text-xs font-semibold">{report.reportType}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-gray-400 text-xs mt-2">{report.timestamp}</Text>
        </View>

        {/* Arrow */}
        <View className="justify-center pr-3">
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </View>
      </View>
    </Pressable>
  );
};
