import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useState } from 'react';
import { BottomTabBar, type TabBarTab } from '../../components/BottomTabBar';

export default function ProfTabLayout() {
  const [currentTab, setCurrentTab] = useState<TabBarTab>('review');

  return (
    <View className="flex-1 bg-white">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#fff' },
        }}
      >
        <Stack.Screen name="review" />
        <Stack.Screen name="consultation" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="notification" />
        <Stack.Screen name="profile" />
      </Stack>

      {/* Bottom Tab Bar */}
      <BottomTabBar currentTab={currentTab} onTabChange={setCurrentTab} />
    </View>
  );
}
