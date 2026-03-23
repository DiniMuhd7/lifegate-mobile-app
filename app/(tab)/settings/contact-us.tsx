import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function ContactScreen() {
  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-6 pb-6 bg-white border-b border-gray-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Contact Us</Text>
        <View className="w-10" />
      </View>

      {/* Blank white content area */}
      <View className="flex-1 bg-white" />
    </View>
  );
}