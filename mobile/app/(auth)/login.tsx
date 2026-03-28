// File: app/(auth)/login.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { useAuthStore } from 'stores/auth/auth-store';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from 'assets/logo.svg';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function LoginScreen() {
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const { loginDraft, setLoginField, clearLoginDraft } = useAuthStore();

  useEffect(() => {
    clearLoginDraft();
  }, []);


  const { login, error } = useAuthStore();

  const validateInputs = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!loginDraft.email.trim()) {
      errors.email = 'Email is required';
    }
    if (!loginDraft.password.trim()) {
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
      const success = await login(loginDraft.email, loginDraft.password, remember);
      if (success) {
      // Get the authenticated user to check their role
      const { user } = useAuthStore.getState();
      
      if (user?.role === 'professional') {
        // Route professional users to their consultation screen
        router.replace('/(prof-tab)/consultation');
      } else {
        // Route regular users to chat screen
        router.replace('/(tab)/chatScreen');
      }
    }
    } finally {
      setLoading(false);
    }
  };

  const isLoginDisabled = !loginDraft.email.trim() || !loginDraft.password.trim() || loading;

  return (
    <SafeAreaView className="flex-1">
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      >

      <View className="h-12" />
      <View className="mb-6 items-center">
        <Logo width={72} height={72} />
      </View>
      <View className="flex-1 rounded rounded-t-[36px] bg-[#F7FEFD] px-10 pt-7">
        <Text className="mb-6 text-center text-2xl font-bold text-[#0EA5A4]">Welcome Back!</Text>
        {error && (
          <View className="mb-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}
        {validationErrors.email && (
          <Text className="mb-1 text-sm font-medium text-red-500">{validationErrors.email}</Text>
        )}
        <LabeledInput
          label="Email Address"
          required
          placeholder="Enter your email address"
          autoCapitalize="none"
          keyboardType="email-address"
          value={loginDraft.email}
          onChangeText={(value) => {
            setLoginField('email', value);
            if (validationErrors.email) {
              setValidationErrors({ ...validationErrors, email: undefined });
            }
          }}
        />
        {validationErrors.password && (
          <Text className="mb-1 mt-3 text-sm font-medium text-red-500">
            {validationErrors.password}
          </Text>
        )}
        <LabeledInput
          label="Password"
          required
          placeholder="Password"
          secureToggle
          value={loginDraft.password}
          onChangeText={(value) => {
            setLoginField('password', value);
            if (validationErrors.password) {
              setValidationErrors({ ...validationErrors, password: undefined });
            }
          }}
        />
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable className="flex-row items-center" onPress={() => setRemember((value) => !value)}>
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
        </SafeAreaView>
  );
}
