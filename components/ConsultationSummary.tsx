import { View, Text } from 'react-native';

interface ConsultationSummaryProps {
  totalReview: number;
  pendingCases: number;
  activeCases: number;
  completedCases: number;
}

const StatBox = ({ label, value }: { label: string; value: number }) => (
  <View className="flex-1 bg-white border border-gray-200 rounded-lg p-3 items-center">
    <Text className="text-xs text-gray-600 mb-2">{label}</Text>
    <Text className="text-2xl font-bold text-teal-600">{value}</Text>
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
        <StatBox label="Total Review" value={totalReview} />
        <StatBox label="Pending Cases" value={pendingCases} />
      </View>

      <View className="flex-row gap-2">
        <StatBox label="Active Cases" value={activeCases} />
        <StatBox label="Completed Cases" value={completedCases} />
      </View>
    </View>
  );
};
