import { View, Text } from "react-native";

export const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string;
}) => (
  <View className="flex-row items-start mb-3 px-3">
    <Text className="text-gray-500 text-sm font-medium w-36">{label}:</Text>
    <Text className="text-gray-900 text-sm font-semibold flex-1 ml-2">
      {value || '—'}
    </Text>
  </View>
);