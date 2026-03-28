import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { useAuthStore } from 'stores/auth/auth-store';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Logo from 'assets/logo.svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const { loginDraft, setLoginField, clearLoginDraft, login, error, clearError } = useAuthStore();

  useEffect(() => {
    clearLoginDraft();
    clearError();
  }, [clearLoginDraft, clearError]);

  const handleEmailChange = (value: string) => {
    setLoginField('email', value);
    if (!value.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Email is required' }));
    } else if (!EMAIL_REGEX.test(value.trim())) {
      setFieldErrors((prev) => ({ ...prev, email: 'Please enter a valid email address' }));
    } else {
      setFieldErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setLoginField('password', value);
    if (!value.trim()) {
      setFieldErrors((prev) => ({ ...prev, password: 'Password is required' }));
    } else {
      setFieldErrors((prev) => ({ ...prev, password: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!loginDraft.email.trim()) errors.email = 'Email is required';
    else if (!EMAIL_REGEX.test(loginDraft.email.trim()))
      errors.email = 'Please enter a valid email address';
    if (!loginDraft.password.trim()) errors.password = 'Password is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const success = await login(loginDraft.email.trim(), loginDraft.password, remember);
      if (success) {
        const { user } = useAuthStore.getState();
        if (user?.role === 'professional') {
          router.replace('/(prof-tab)/consultation');
        } else {
          router.replace('/(tab)/chatScreen');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    loginDraft.email.trim() !== '' &&
    loginDraft.password.trim() !== '' &&
    !loading &&
    !fieldErrors.email &&
    !fieldErrors.password;

  return (
    <SafeAreaView className="flex-1">
      <LinearGradient
        colors={['#0AADA2', '#043B3C']}
        className="flex-1"
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.2 }}>
        {/* Gradient header */}
        <View className="items-center px-6 pb-6 pt-10">
          <Logo width={64} height={64} />
          <Text className="mt-3 text-2xl font-bold text-white">Welcome Back</Text>
          <Text className="mt-1 text-sm text-white/70">Sign in to your LifeGate account</Text>
        </View>

        {/* Card */}
        <ScrollView
          className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          {/* Backend error */}
          {error ? (
            <View className="mb-4 flex-row items-start rounded-xl bg-red-50 p-3">
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text className="ml-2 flex-1 text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {/* Email */}
          <LabeledInput
            label="Email Address"
            required
            placeholder="Enter your email address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={loginDraft.email}
            hasError={!!fieldErrors.email}
            onChangeText={handleEmailChange}
          />
          {fieldErrors.email ? (
            <View className="-mt-2 mb-3 flex-row items-center">
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text className="ml-1 text-xs text-red-500">{fieldErrors.email}</Text>
            </View>
          ) : null}

          {/* Password */}
          <LabeledInput
            label="Password"
            required
            placeholder="Enter your password"
            secureToggle
            value={loginDraft.password}
            hasError={!!fieldErrors.password}
            onChangeText={handlePasswordChange}
          />
          {fieldErrors.password ? (
            <View className="-mt-2 mb-3 flex-row items-center">
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text className="ml-1 text-xs text-red-500">{fieldErrors.password}</Text>
            </View>
          ) : null}

          {/* Remember me + Forgot password */}
          <View className="mb-6 mt-1 flex-row items-center justify-between">
            <Pressable className="flex-row items-center" onPress={() => setRemember((v) => !v)}>
              <View
                className={`mr-2 h-5 w-5 items-center justify-center rounded-full border-2 ${
                  remember ? 'border-[#0EA5A4] bg-[#0EA5A4]' : 'border-gray-400'
                }`}>
                {remember && <Ionicons name="checkmark" size={11} color="white" />}
              </View>
              <Text className="text-xs text-gray-700">Remember me</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
              <Text className="text-xs font-semibold text-[#0EA5A4]">Forgot Password?</Text>
            </Pressable>
          </View>

          <PrimaryButton
            title="Sign In"
            onPress={onLogin}
            loading={loading}
            disabled={!canSubmit}
          />

          <View className="mt-6 flex-row justify-center">
            <Text className="text-sm text-gray-500">Don&apos;t have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/register-choice')}>
              <Text className="text-sm font-semibold text-[#0EA5A4]">Register</Text>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}
