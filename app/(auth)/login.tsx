// File: app/(auth)/login.tsx
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { useAuthStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from 'assets/logo.svg';
export default function LoginScreen() {
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const { userDraft, setUserField, login, error } = useAuthStore();

  const onLogin = async () => {
    setLoading(true);
    try {
      const success = await login(userDraft.email, userDraft.password);
      if (success) {
        router.replace('/(tab)/chatScreen');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      style={{ flex: 1 }}>
      <View className="h-12" />
        <View className="items-center mb-6">
          <Logo width={72} height={72} />
        </View>
      <View className="flex-1 rounded rounded-t-[36px] bg-[#F7FEFD] px-10 pt-7">
        <Text className="mb-6 text-center text-2xl font-bold text-[#0EA5A4]">Welcome Back!</Text>
        
        {/* Backend Error Message */}
        {error && (
          <View className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
            <Text className="text-red-700 text-sm">{error}</Text>
          </View>
        )}

        <LabeledInput
          label="Email Address"
          required
          placeholder="Enter your email address"
          autoCapitalize="none"
          keyboardType="email-address"
          value={userDraft.email}
          onChangeText={(value) => setUserField('email', value)}
        />

        <LabeledInput
          label="Password"
          required
          placeholder="Password"
          secureToggle
          value={userDraft.password}
          onChangeText={(value) => setUserField('password', value)}
        />
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable className="flex-row items-center" onPress={() => setRemember((v) => !v)}>
            <View
              className={`mr-2 h-6 w-6 rounded-full border border-[#0EA5A4] ${
                remember ? 'bg-[#0EA5A4]' : 'bg-transparent'
              }`}
            />
            <Text className="text-xs text-gray-700">Remember me</Text>
          </Pressable>

          <Pressable>
            <Text className="text-xs font-semibold text-[#0EA5A4]">Forgot Password?</Text>
          </Pressable>
        </View>

        <View className="mt-5">
          <PrimaryButton 
            title="Login" 
            onPress={onLogin}
            loading={loading}
          />
        </View>
                
        <View className="mt-5 flex-row justify-center">
          <Text className="text-gray-500">Don’t have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/register-choice')}>
            <Text className="font-semibold text-[#0EA5A4]">Register</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}