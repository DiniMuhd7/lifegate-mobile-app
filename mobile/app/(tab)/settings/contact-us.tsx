import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';

export default function ContactScreen() {
  const insets = useSafeAreaInsets();

  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmailPress = () => {
    Linking.openURL('mailto:contact@dshub.com.ng');
  };

  const openSocialMedia = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">Contact Us</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="mb-4 rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4">
          <Text className="text-sm text-gray-700 leading-5">
            Our support team can help with account questions, billing issues, and app guidance.
          </Text>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Email Support</Text>
          <Pressable
            onPress={handleEmailPress}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80"
          >
            <Ionicons name="mail-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">contact@dshub.com.ng</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Phone</Text>
          <Pressable
            onPress={() => handlePhonePress('+2349013453490')}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80"
          >
            <Ionicons name="call-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">+2349013453490, +2349110192583</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-5">
          <Text className="text-lg font-bold text-gray-900 text-center mb-5">Social Media</Text>

          <View className="flex-row items-center justify-center gap-4">
            <Pressable
              onPress={() => openSocialMedia('https://facebook.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-blue-600 active:opacity-80"
            >
              <FontAwesome name="facebook" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://linkedin.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-blue-700 active:opacity-80"
            >
              <FontAwesome name="linkedin" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://instagram.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-[#D946EF] active:opacity-80"
            >
              <FontAwesome name="instagram" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://twitter.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-black active:opacity-80"
            >
              <FontAwesome name="twitter" size={24} color="white" />
            </Pressable>
          </View>

          <Text className="text-sm text-gray-600 text-center mt-6">LifeGate by DSHub</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}