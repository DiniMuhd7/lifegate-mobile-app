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

  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const { userDraft, setUserField, login, error } = useAuthStore();

  const validateInputs = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!userDraft.email.trim()) {
      errors.email = 'Email is required';
    }
    if (!userDraft.password.trim()) {
      errors.password = 'Password is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onLogin = async () => {
    if (!validateInputs()) {
      return;
    }

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

  const isLoginDisabled = !userDraft.email.trim() || !userDraft.password.trim() || loading;

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
        
        Backend Error Message
        {error && (
          <View className=" p-2 mb-2">
            <Text className="text-red-700 text-sm">{error.message}</Text>
          </View>
        )
        }

        {validationErrors.email && (
          <Text className="text-red-500 text-sm font-medium mb-1">{validationErrors.email}</Text>
        )}
        <LabeledInput
          label="Email Address"
          required
          placeholder="Enter your email address"
          autoCapitalize="none"
          keyboardType="email-address"
          value={userDraft.email}
          onChangeText={(value) => {
            setUserField('email', value);
            if (validationErrors.email) {
              setValidationErrors({ ...validationErrors, email: undefined });
            }
          }}
        />

        {validationErrors.password && (
          <Text className="text-red-500 text-sm font-medium mb-1 mt-3">{validationErrors.password}</Text>
        )}
        <LabeledInput
          label="Password"
          required
          placeholder="Password"
          secureToggle
          value={userDraft.password}
          onChangeText={(value) => {
            setUserField('password', value);
            if (validationErrors.password) {
              setValidationErrors({ ...validationErrors, password: undefined });
            }
          }}
        />
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable className="flex-row items-center" onPress={() => setRemember((v) => !v)}>
            <View
              className={`mr-2 h-6 w-6 rounded-2xl border border-[#0EA5A4] ${
                remember ? 'bg-[#0EA5A4]' : 'bg-transparent'
              }`}
            />
            <Text className="text-[12px] text-gray-700">Remember me</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
            <Text className="text-[12px] font-semibold text-[#0EA5A4]">Forgot Password?</Text>
          </Pressable>
        </View>

        <View className="mt-5">
          <PrimaryButton 
            title="Login" 
            onPress={onLogin}
            loading={loading}
            disabled={isLoginDisabled}
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