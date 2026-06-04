import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const InfoRow = ({
  label,
  value,
  icon,
  isLast = false,
}: {
  label: string;
  value?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  isLast?: boolean;
}) => (
  <View className={`flex-row items-center py-3 ${!isLast ? 'border-b border-gray-100' : ''}`}>
    {icon && (
      <View
        className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-[#EDF9F9]">
        <Ionicons name={icon} size={15} color="#0EA5A4" />
      </View>
    )}
    <View className="flex-1">
      <Text className="text-xs font-medium text-gray-400">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-gray-900">{value || '—'}</Text>
    </View>
  </View>
);