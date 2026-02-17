// File: app/(auth)/login.tsx
import React, { useState } from 'react';
import { View, Text,Pressable } from 'react-native';
import { LabeledInput  } from 'components/input';
import { PrimaryButton } from 'components/Button';
import { router } from 'expo-router';
// ---------------- Login Screen ----------------
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  const onLogin = () => {
    console.log({ email, password, remember });
  };

  return (
    <View className="flex-1 bg-[#0EA5A4]">
      <View className="h-56" />

      <View className="flex-1 bg-gray-100 rounded-t-[36px] px-6 pt-7">
        <Text className="text-center text-[#0EA5A4] text-2xl font-bold mb-6">
          Welcome Back!
        </Text>

        <LabeledInput
          label="Email Address"
          required
          placeholder="xyz1@gmail.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <LabeledInput
          label="Password"
          required
          placeholder="Password"
          secureToggle
          value={password}
          onChangeText={setPassword}
        />

        <View className="flex-row items-center justify-between mt-1">
          <Pressable className="flex-row items-center" onPress={() => setRemember((v) => !v)}>
            <View
              className={`w-4 h-4 rounded border border-[#0EA5A4] mr-2 ${
                remember ? 'bg-[#0EA5A4]' : 'bg-transparent'
              }`}
            />
            <Text className="text-gray-700 text-xs">Remember me</Text>
          </Pressable>

          <Pressable>
            <Text className="text-[#0EA5A4] font-semibold text-xs">Forgot Password?</Text>
          </Pressable>
        </View>

        <View className="mt-5">
          <PrimaryButton title="Login" onPress={onLogin} />
        </View>

        <View className="flex-row justify-center mt-5">
          <Text className="text-gray-500">Don’t have an account? </Text>
          <Pressable onPress={() => router.push('/register')}>
            <Text className="text-[#0EA5A4] font-semibold">Create an account</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
