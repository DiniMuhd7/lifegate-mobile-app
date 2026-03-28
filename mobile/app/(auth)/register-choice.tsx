import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRegistrationStore } from 'stores/auth/registration-store';
import { SafeAreaView } from 'react-native-safe-area-context';

type RoleCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
};

function RoleCard({ icon, title, description, onPress }: RoleCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-4 flex-row items-center rounded-2xl bg-white p-5 active:opacity-75"
      style={{
        shadowColor: '#0AADA2',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}>
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-[#EDF9F9]">
        <Ionicons name={icon} size={28} color="#0EA5A4" />
      </View>
      <View className="ml-4 flex-1">
        <Text className="text-base font-bold text-gray-900">{title}</Text>
        <Text className="mt-0.5 text-sm text-gray-500">{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
    </Pressable>
  );
}

export default function RegisterChoiceScreen() {
  const { setUserField } = useRegistrationStore();

  const handleRegisterAsUser = () => {
    setUserField('role', 'user');
    router.push('/(auth)/(user)');
  };

  const handleRegisterAsHealthProfessional = () => {
    setUserField('role', 'professional');
    router.push('/(auth)/(health-professional)');
  };

  return (
    <SafeAreaView className="flex-1">
      <LinearGradient
        colors={['#0AADA5', '#043B3C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.35 }}
        style={{ flex: 1 }}>
        {/* Header */}
        <View className="px-6 pb-8 pt-4">
          <Pressable
            onPress={() => router.back()}
            className="-ml-2 mb-6 self-start rounded-full p-2 active:opacity-70">
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
          <Text className="text-3xl font-bold text-white">Create Account</Text>
          <Text className="mt-2 text-sm text-white/75">
            Select the type of account you’d like to create
          </Text>
        </View>

        {/* Content Card */}
        <View className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-6 pt-8">
          <RoleCard
            icon="person-outline"
            title="Patient"
            description="Get AI-powered health insights and consult with licensed doctors"
            onPress={handleRegisterAsUser}
          />
          <RoleCard
            icon="medkit-outline"
            title="Medical Professional"
            description="Review AI diagnoses and provide expert validation as a physician"
            onPress={handleRegisterAsHealthProfessional}
          />

          <View className="mt-6 flex-row justify-center">
            <Text className="text-gray-500">Already have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/login')}>
              <Text className="font-semibold text-[#0EA5A4]">Sign In</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}
