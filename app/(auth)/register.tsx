import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/input';
import { useAuthStore } from 'store/userStore';

// ---------------- Register Screen ----------------
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  

  const onRegister = () => {
    console.log({ name, email, password, confirm });
  };

  return (
    <View className="flex-1 bg-[#0EA5A4]">
      <View className="h-56" />

      <ScrollView className="flex-1 bg-gray-100 rounded-t-[36px] px-6 pt-7" contentContainerStyle={{ paddingBottom: 30 }}>
        <Text className="text-center text-[#0EA5A4] text-2xl font-bold mb-6">
          Create Account
        </Text>

        <LabeledInput
          label="Full Name"
          required
          placeholder="John Doe"
          value={name}
          onChangeText={setName}
        />

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

        <LabeledInput
          label="Confirm Password"
          required
          placeholder="Re-enter password"
          secureToggle
          value={confirm}
          onChangeText={setConfirm}
        />

        <View className="mt-3">
          <PrimaryButton title="Register" onPress={onRegister} />
        </View>
        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-500">Already have an account? </Text>
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <Text className="text-[#0EA5A4] font-semibold">Login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
