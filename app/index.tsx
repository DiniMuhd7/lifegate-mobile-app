// File: app/index.tsx  (Splash Screen - shows for 3 seconds then navigates)
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';

export default function SplashScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(auth)/login');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-[#0EA5A4] items-center justify-center">
      <Text className="text-white text-3xl font-bold">Lifegate</Text>
      <Text className="text-white/80 mt-2">AI Health Assistant</Text>
    </View>
  );
}