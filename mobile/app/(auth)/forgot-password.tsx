import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePasswordRecoveryStore } from 'stores/auth/password-recovery-store';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { sendOtpForPasswordRecovery } = usePasswordRecoveryStore.getState();
      const success = await sendOtpForPasswordRecovery(email);
      
      if (success) {
        // Navigate to OTP verification
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email, mode: 'passwordReset' }
        });
      } else {
        const { error } = usePasswordRecoveryStore.getState();
        setError(error || 'Failed to send reset code');
      }
    } catch (err) {
      setError('Failed to send reset code. Please try again.');
      console.error('Forgot password error:', err);
    } finally {
      setLoading(false);
      }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      style={{ flex: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text className="flex-1 text-center text-xl font-bold text-white">
          Forgot Password
        </Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 36, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        {/* Icon */}
        <View className="mb-4 items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-[#EDF9F9]">
            <Ionicons name="lock-closed-outline" size={30} color="#0EA5A4" />
          </View>
        </View>
        <Text className="mb-1 text-center text-2xl font-bold text-gray-900">
          Forgot Password?
        </Text>
        <Text className="mb-8 text-center text-sm text-gray-500">
          Enter your email and we&apos;ll send you a reset code
        </Text>

        {/* Error Message */}
        {error ? (
          <View className="mb-5 flex-row items-start rounded-xl bg-red-50 p-3">
            <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
            <Text className="ml-2 flex-1 text-sm text-red-700">{error}</Text>
          </View>
        ) : null}

        {/* Email Input */}
        <LabeledInput
          label="Email Address"
          required
          placeholder="Enter your email address"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
          }}
          editable={!loading}
        />

        {/* Submit Button */}
        <View className="mt-6">
          <PrimaryButton
            title="Send Reset Code"
            onPress={handleSubmit}
            loading={loading}
            disabled={!email.trim() || loading}
          />
        </View>

        <View className="h-8" />
      </ScrollView>
    </LinearGradient>
    </SafeAreaView>
  );
}
