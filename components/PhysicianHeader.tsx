import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';
import { router } from 'expo-router';

export const PhysicianHeader = () => {
  const { user } = useAuthStore();
  const physicianName = user?.name?.split(' ')[0] || 'Doctor';

  return (
    <View className="bg-gradient-to-b from-teal-600 to-teal-700 px-6 pt-6 pb-2">
      {/* Top row with greeting and icons */}
      <View className="flex-row justify-between items-center  mt-6">
        <View>      
          <Text className="text-black text-2xl font-bold">Hi, Dr. {physicianName}</Text>
          <Text className="text-black text-sm mt-1">Ready for today&apos;s cases?</Text>
        </View>
        
        <View className="flex-row gap-4">
          <Pressable 
            className="w-12 h-12 rounded-full border-2 border-[#38887D] items-center justify-center"
            onPress={() => router.push('/(prof-tab)/notification')}
          >
            <Ionicons name="notifications-outline" size={24} color="#38887D" />
          </Pressable>
          
          <Pressable 
            className="w-12 h-12 rounded-full border-2 border-[#38887D] items-center justify-center"
            onPress={() => router.push('/(prof-tab)/profile')}
          >
            <Ionicons name="person-outline" size={24} color="#38887D" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};