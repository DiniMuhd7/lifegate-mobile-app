import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { useState } from 'react';

export default function SettingsScreen() {
  const { logout } = useAuthStore();
  const [themeEnabled, setThemeEnabled] = useState(true);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const SettingRow = ({
    icon,
    label,
    onPress,
    showArrow = true,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    showArrow?: boolean;
  }) => (
    <Pressable onPress={onPress} className="flex-row items-center justify-between py-4 px-4 ">
      <View className="flex-row items-center flex-1">
        <MaterialCommunityIcons name={icon} size={24} color="#0EA5A4" />
        <Text className="ml-4  text-gray-900 font-normal">{label}</Text>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />}
    </Pressable>
  );

  const ThemeToggle = () => (
    <Pressable
      onPress={() => setThemeEnabled(!themeEnabled)}
      className="flex-row items-center justify-between py-4 px-4 border-b border-gray-200">
      <View className="flex-row items-center flex-1">
        <MaterialCommunityIcons name="palette-outline" size={24} color="#0EA5A4" />
        <Text className="ml-4 text-base text-gray-900">Theme</Text>
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
  );

  return (
    <View className="flex-1 bg-[#F7FEFD]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 p-4">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-2xl font-bold text-black">Settings</Text>
        <View className="w-10" />
      </View>
      {/* Content */}
      <ScrollView className="flex-1 rounded-t-[36px] bg-[#F7FEFD]">
        {/* Account Section */}
        <View className="mt-6">
          <Text className="px-4 text-xm font-semibold text-gray-600  tracking-wide">
            Account
          </Text>
          <SettingRow
            icon="account-edit-outline"
            label="Manage Profile"
            onPress={() => router.push('/(tab)/settings/manage-profile')}
          />
          <SettingRow
            icon="bell-outline"
            label="Notification"
            onPress={() => router.push('/(tab)/settings/notification')}
          />
          <SettingRow
            icon="credit-card-outline"
            label="Subscription"
            onPress={() => router.push('/(tab)/settings/subscription')}
          />
        </View>

        {/* Preference Section */}
        <View className="mt-8">
          <Text className="px-4 text-xm font-semibold text-gray-600  tracking-wide">
            Preference
          </Text>
          <ThemeToggle />
        </View>

        {/* Support Section */}
        <View className="mt-8">
          <Text className="px-4 text-xm font-semibold text-gray-600  tracking-wide">
            Support
          </Text>
          <SettingRow
            icon="email-outline"
            label="Contact Us"
            onPress={() => router.push('/(tab)/settings/contact-us')}
          />
          <SettingRow
            icon="help-circle-outline"
            label="Help Center"
            onPress={() => router.push('/(tab)/settings/help-center')}
          />
        </View>

        {/* Logout Button */}
        <View className="px-4 py-8">
          <Pressable
            onPress={handleLogout}
            className="rounded-lg bg-[#0EA5A4] py-4 items-center w-4/6 self-center flex-row justify-center">
            <Text className="text-base font-semibold text-white">Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}