import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons, FontAwesome} from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ContactScreen() {
  const insets = useSafeAreaInsets();

  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmailPress = () => {
    Linking.openURL('mailto:dinsoft.dev@gmail.com');
  };

  const openSocialMedia = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingBottom: insets.bottom }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-6 bg-white">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Contact Us</Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-6 pt-8">
        {/* Description */}
        <View className="mb-10 items-center">
          <Text className="text-base text-black text-center leading-5">
            Please contact us if you have any questions.{'\n'}We will be pleased to assist you.
          </Text>
        </View>

        {/* Email Section */}
        <View className="mb-8">
          <Pressable
            onPress={handleEmailPress}
            className="flex-row items-center"
          >
            <Ionicons name="mail" size={24} color="#14A8A8" />
            <Text className="ml-4 text-base text-gray-900 font-medium">
              dinsoft.dev@gmail.com
            </Text>
          </Pressable>
        </View>

        {/* Phone Section */}
        <View className="mb-12">
          <Pressable
            onPress={() => handlePhonePress('+2349013453490')}
            className="flex-row items-center mb-4"
          >
            <Ionicons name="call" size={24} color="#14A8A8" />
            <Text className="ml-4 text-base text-gray-900 font-medium">
              +2349013453490 , +2349110192583
            </Text>
          </Pressable>
        </View>

        {/* Social Media Section */}
        <View className="mb-12 items-center">
          <Text className="text-lg font-bold text-gray-900 text-center mb-6">
            Social Media
          </Text>
          
          <View className="flex-row items-center justify-center space-x-12">
            <Pressable
              onPress={() => openSocialMedia('https://facebook.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-blue-600"
            >
              <FontAwesome name="facebook" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://linkedin.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-blue-700"
            >
              <FontAwesome name="linkedin" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://instagram.com')}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
            >
              <FontAwesome name="instagram" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => openSocialMedia('https://twitter.com')}
              className="w-12 h-12 rounded-full items-center justify-center bg-black"
            >
              <FontAwesome name="twitter" size={24} color="white" />
            </Pressable>
          </View>

          <Text className="text-sm text-gray-600 text-center mt-6">
            LifeGate by DSHub
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}