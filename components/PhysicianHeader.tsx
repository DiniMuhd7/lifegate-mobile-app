import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';

export const PhysicianHeader = () => {
  const { user } = useAuthStore();
  const physicianName = user?.name?.split(' ')[0] || 'Doctor';

  return (
    <View className="bg-gradient-to-b from-teal-600 to-teal-700 px-6 pt-6 pb-2">
      {/* Top row with greeting and icons */}
      <View className="flex-row justify-between items-center  mt-6">
        <View>
          <Text className="text-black text-2xl font-bold">Hi, Dr. {physicianName}</Text>
          <Text className="text-black text-sm mt-1">Ready for today's cases?</Text>
        </View>
        
        <View className="flex-row gap-4">
          <Pressable 
            className="w-12 h-12 rounded-full border-2 border-white items-center justify-center"
            onPress={() => {
              // Handle notification icon press
            }}
          >
            <Ionicons name="notifications-outline" size={24} color="teal-700" />
          </Pressable>
          
          <Pressable 
            className="w-12 h-12 rounded-full border-2 border-white items-center justify-center"
            onPress={() => {
              // Handle profile icon press
            }}
          >
            <Ionicons name="person-outline" size={24} color="teal-700" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};
