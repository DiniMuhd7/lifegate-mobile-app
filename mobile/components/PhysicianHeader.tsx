import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../stores/auth/auth-store';
import { router } from 'expo-router';

export const PhysicianHeader = () => {
  const { user } = useAuthStore();
  const physicianName = user?.name?.split(' ')[0] || 'Doctor';

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="px-6 pt-6 pb-4"
    >
      <View className="flex-row justify-between items-center mt-6">
        <View>
          <Text className="text-white/70 text-sm font-medium">Welcome back,</Text>
          <Text className="text-white text-2xl font-bold mt-0.5">Dr. {physicianName}</Text>
          <Text className="text-white/60 text-xs mt-1">Ready for today&apos;s cases?</Text>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            className="w-11 h-11 rounded-full bg-white/15 items-center justify-center"
            onPress={() => router.push('/(prof-tab)/notification')}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
          </Pressable>

          <Pressable
            className="w-11 h-11 rounded-full bg-white/15 items-center justify-center"
            onPress={() => router.push('/(prof-tab)/profile')}
          >
            <Ionicons name="person-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
};