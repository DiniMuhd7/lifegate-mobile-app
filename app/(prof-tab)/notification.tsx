import React from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function NotificationScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-6 pt-12 pb-4 border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#0AADA2" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-xl font-bold text-gray-800 mr-8">
          Notification
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ justifyContent: 'center', alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center justify-center py-16">
          {/* Empty State Icon */}
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Ionicons name="notifications-off" size={32} color="#999" />
          </View>

          {/* Empty State Message */}
          <Text className="text-center text-lg font-semibold text-gray-800">
            No notification available
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-500 px-6">
            Check back later for new notifications
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
