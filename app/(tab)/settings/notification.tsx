import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';


export default function NotificationScreen() {

const [themeEnabled, setThemeEnabled] = useState(true);
    const NotificationToggle = () => (
    <Pressable
      onPress={() => setThemeEnabled(!themeEnabled)}
      className="flex-row items-center justify-between py-4 px-4">
      <View className="flex-row items-center flex-1">
        <Text className="ml-4 text-base text-gray-900">Push Notification</Text>
      </View>
      <View
        className={`h-7 w-14 rounded-full flex-row items-center px-1 ${
          themeEnabled ? 'bg-[#0EA5A4]' : 'bg-gray-300'
        }`}>
        <View
          className={`h-6 w-6 rounded-full bg-white ${themeEnabled ? 'ml-auto' : ''}`}
        />
      </View>
    </Pressable>
  )

  
  return (
    <View className="flex-1 bg-white justify-start">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-6">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Notifications</Text>
        <View className="w-10" />
      </View>

      {/* Blank white content area */}
      <View className=" bg-white" />
      <NotificationToggle/>
    </View>
  );
}