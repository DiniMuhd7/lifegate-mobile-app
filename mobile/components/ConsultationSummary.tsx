import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConsultationSummaryProps {
  totalReview: number;
  pendingCases: number;
  activeCases: number;
  completedCases: number;
}

interface StatBoxProps {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
}

const StatBox = ({ label, value, icon, iconColor, iconBg }: StatBoxProps) => (
  <View className="flex-1 bg-white border border-gray-100 rounded-xl p-3"
    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
    <View style={{ backgroundColor: iconBg }} className="w-8 h-8 rounded-lg items-center justify-center mb-2">
      <Ionicons name={icon} size={16} color={iconColor} />
    </View>
    <Text className="text-2xl font-bold text-gray-900">{value}</Text>
    <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
  </View>
);

export const ConsultationSummary = ({
  totalReview,
  pendingCases,
  activeCases,
  completedCases,
}: ConsultationSummaryProps) => {
  return (
    <View className="px-6 py-4">
      <Text className="text-lg font-semibold text-gray-900 mb-3">Consultation Summary</Text>

      <View className="flex-row gap-2 mb-2">
        <StatBox
          label="Total Review"
          value={totalReview}
          icon="documents-outline"
          iconColor="#0EA5A4"
          iconBg="#EDF9F9"
        />
        <StatBox
          label="Pending"
          value={pendingCases}
          icon="time-outline"
          iconColor="#F59E0B"
          iconBg="#FFF7ED"
        />
      </View>

      <View className="flex-row gap-2">
        <StatBox
          label="Active"
          value={activeCases}
          icon="flash-outline"
          iconColor="#3B82F6"
          iconBg="#EFF6FF"
        />
        <StatBox
          label="Completed"
          value={completedCases}
          icon="checkmark-circle-outline"
          iconColor="#10B981"
          iconBg="#ECFDF5"
        />
      </View>
    </View>
  );
};
