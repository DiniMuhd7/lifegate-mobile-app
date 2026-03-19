import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePasswordRecoveryStore } from 'stores/auth/password-recovery-store';
import { validateSingleField } from 'utils/validation';
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
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      style={{ flex: 1 }}>
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-8 pt-24 pb-6">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text className="flex-1 text-center text-xl font-bold text-white">
          Forgot Password
        </Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-12 pt-8">
        <Text className="mb-2 text-center text-2xl font-bold text-gray-900">
          Forgot Password?
        </Text>
        <Text className="mb-6 text-center text-base text-gray-600">
          Quickly reset your password
        </Text>

        {/* Error Message */}
        {error && (
          <View className="mb-4 rounded-lg border border-red-400 bg-red-100 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

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
        <View className="mt-8">
          <PrimaryButton
            title="Submit"
            onPress={handleSubmit}
            loading={loading}
          />
        </View>

        {/* Bottom spacing */}
        <View className="h-8" />
      </ScrollView>
    </LinearGradient>
  );
}
