import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from 'stores/auth-store';

const VALID_FIELDS = {
  name: true,
  email: true,
  password: true,
  confirmPassword: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Auto-navigate after success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const validatePassword = (password: string): string => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain a number';
    return '';
  };

  const handleResetPassword = async () => {
    setError('');

    // Validate new password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    // Validate confirm password
    if (!confirmPassword) {
      setError('Please confirm your password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);

    try {
      const { resetPassword: storeResetPassword } = useAuthStore.getState();
      
      // For now, we'll use a placeholder OTP - the actual OTP was verified in previous screen
      const success = await storeResetPassword(email, newPassword, '');
      
      if (success) {
        setSuccess(true);
      } else {
        const { error } = useAuthStore.getState();
        setError(error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Failed to reset password. Please try again.');
      console.error('Reset password error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <LinearGradient
        colors={['#0AADA2', '#043B3C']}
        className="flex-1 pt-24"
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.2 }}
        style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center rounded-t-[36px] bg-[#F7FEFD]">
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <Ionicons name="checkmark" size={48} color="#10B981" />
          </View>
          <Text className="mb-3 text-center text-2xl font-bold text-gray-900">
            Password Reset
          </Text>
          <Text className="mb-8 text-center text-base text-gray-600 px-6">
            Your password has been successfully reset. Redirecting to login...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1 pt-24 "
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      style={{ flex: 1 }}>
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-12 pt-4 pb-6">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text className="flex-1 text-center text-xl font-bold text-white">
          Reset Password
        </Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-6 pt-8">
        <Text className="mb-2 text-center text-2xl font-bold text-gray-900">
          Create New Password
        </Text>
        <Text className="mb-6 text-center text-base text-gray-600">
          Set a strong password for your account
        </Text>

        {/* Error Message */}
        {error && (
          <View className="mb-4 rounded-lg border border-red-400 bg-red-100 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {/* New Password Input */}
        <LabeledInput
          label="New Password"
          required
          placeholder="Enter new password"
          secureToggle
          value={newPassword}
          onChangeText={(value) => {
            setNewPassword(value);
            setError('');
          }}
          editable={!loading}
        />

        {/* Password Requirements Info
        <View className="mb-4 rounded-lg bg-blue-50 p-3">
          <Text className="mb-2 text-xs font-semibold text-blue-900">
            Password must contain:
          </Text>
          <Text
            className={`text-xs ${
              newPassword.length >= 8 ? 'text-green-600' : 'text-gray-600'
            }`}>
            ✓ At least 8 characters
          </Text>
          <Text
            className={`text-xs ${
              /[A-Z]/.test(newPassword) ? 'text-green-600' : 'text-gray-600'
            }`}>
            ✓ One uppercase letter
          </Text>
          <Text
            className={`text-xs ${
              /[a-z]/.test(newPassword) ? 'text-green-600' : 'text-gray-600'
            }`}>
            ✓ One lowercase letter
          </Text>
          <Text
            className={`text-xs ${
              /[0-9]/.test(newPassword) ? 'text-green-600' : 'text-gray-600'
            }`}>
            ✓ One number
          </Text>
        </View> */}

        {/* Confirm Password Input */}
        <LabeledInput
          label="Confirm Password"
          required
          placeholder="Confirm password"
          secureToggle
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setError('');
          }}
          editable={!loading}
        />

        {/* Reset Button */}
        <View className="mt-8">
          <PrimaryButton
            title="Reset Password"
            onPress={handleResetPassword}
            loading={loading}
          />
        </View>

        {/* Bottom spacing */}
        <View className="h-8" />
      </ScrollView>
    </LinearGradient>
  );
}
