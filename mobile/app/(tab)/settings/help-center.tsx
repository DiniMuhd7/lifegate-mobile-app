import { View, Text, Pressable } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

const HelpItem = ({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center px-5 py-4"
  >
    {/* Icon */}
    <View className="w-8 items-center">
      {icon}
    </View>

    {/* Text */}
    <View className="ml-4">
      <Text className="text-[15px] text-gray-800 font-medium">
        {title}
      </Text>
      {subtitle && (
        <Text className="text-[12px] text-gray-400 mt-1">
          {subtitle}
        </Text>
      )}
    </View>
  </Pressable>
);

export default function HelpScreen() {
  return (
    <View className="flex-1 bg-[#F5F7F7] py-6">
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-6 pb-4 bg-[#F5F7F7]">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="#1f2937" />
        </Pressable>

        <Text className="text-xl font-semibold text-gray-900">
          Help Center
        </Text>

        <View className="w-10" />
      </View>

      {/* Content */}
      <View className="mt-4">
        
        <HelpItem
          title="Send Feedback"
          onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
          subtitle="Report issues"
          icon={<Feather name="message-circle" size={18} color="#38887D" />}
        />

        <HelpItem
          title="App Info"
          icon={<Feather name="info" size={18} color="#38887D" />}
        />

        <HelpItem
          title="Rate Us"
          icon={<Feather name="star" size={18} color="#38887D" />}
        />

      </View>
    </View>
  );
}