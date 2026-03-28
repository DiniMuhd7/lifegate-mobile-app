import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConsultationSummaryProps {
  totalReview: number;
  pendingCases: number;
  activeCases: number;
  completedCases: number;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  accentColor: string;
}

const StatCard = ({ label, value, icon, iconColor, iconBg, accentColor }: StatCardProps) => (
  <View
    className="flex-1 bg-white rounded-2xl p-4 overflow-hidden"
    style={{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
      borderTopWidth: 3,
      borderTopColor: accentColor,
    }}
  >
    <View
      className="w-9 h-9 rounded-xl items-center justify-center mb-3"
      style={{ backgroundColor: iconBg }}
    >
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text className="text-3xl font-bold text-gray-900">{value}</Text>
    <Text className="text-xs text-gray-500 mt-1 font-medium">{label}</Text>
  </View>
);

export const ConsultationSummary = ({
  totalReview,
  pendingCases,
  activeCases,
  completedCases,
}: ConsultationSummaryProps) => {
  return (
    <View className="px-5 pt-4 pb-2">
      <Text className="text-base font-bold text-gray-900 mb-3">Overview</Text>

      <View className="flex-row gap-3 mb-3">
        <StatCard
          label="Total Cases"
          value={totalReview}
          icon="documents-outline"
          iconColor="#0EA5A4"
          iconBg="#EDF9F9"
          accentColor="#0EA5A4"
        />
        <StatCard
          label="Pending"
          value={pendingCases}
          icon="time-outline"
          iconColor="#F59E0B"
          iconBg="#FFF7ED"
          accentColor="#F59E0B"
        />
      </View>

      <View className="flex-row gap-3">
        <StatCard
          label="Active"
          value={activeCases}
          icon="flash-outline"
          iconColor="#3B82F6"
          iconBg="#EFF6FF"
          accentColor="#3B82F6"
        />
        <StatCard
          label="Completed"
          value={completedCases}
          icon="checkmark-circle-outline"
          iconColor="#10B981"
          iconBg="#ECFDF5"
          accentColor="#10B981"
        />
      </View>
    </View>
  );
};

