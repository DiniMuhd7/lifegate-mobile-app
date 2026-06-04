import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { PasswordStrengthBar } from 'components/PasswordStrength';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePasswordRecoveryStore } from 'stores/auth/password-recovery-store';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.replace('/(auth)/login'), 2000);
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

  const handleReset = async () => {
    setError('');
    const passwordError = validatePassword(newPassword);
    if (passwordError) { setError(passwordError); return; }
    if (!confirmPassword) { setError('Please confirm your password'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const { resetPassword: storeReset } = usePasswordRecoveryStore.getState();
      const ok = await storeReset(token, newPassword);
      if (ok) {
        setSuccess(true);
      } else {
        const { error: storeError } = usePasswordRecoveryStore.getState();
        setError(storeError || 'Failed to reset password');
      }
    } catch {
      setError('Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <LinearGradient
          colors={['#0AADA2', '#043B3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View className="mb-6 h-24 w-24 items-center justify-center rounded-full bg-white/20">
            <Ionicons name="checkmark-circle" size={56} color="white" />
          </View>
          <Text className="mb-3 text-center text-3xl font-bold text-white">Password Reset!</Text>
          <Text className="text-center text-sm text-white/80">
            Redirecting to login...
          </Text>
        </LinearGradient>
      </SafeAreaView>
    );
  }

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
          <Text className="flex-1 text-center text-xl font-bold text-white">Reset Password</Text>
          <View className="w-10" />
        </View>

        {/* Content Card */}
        <ScrollView
          className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 36, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">

          {/* Icon */}
          <View className="mb-4 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-[#EDF9F9]">
              <Ionicons name="key-outline" size={30} color="#0EA5A4" />
            </View>
          </View>

          <Text className="mb-1 text-center text-2xl font-bold text-gray-900">
            Create New Password
          </Text>
          <Text className="mb-7 text-center text-sm text-gray-500">
            Set a strong password for your account
          </Text>

          {/* Error */}
          {error ? (
            <View className="mb-4 flex-row items-start rounded-xl bg-red-50 p-3">
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text className="ml-2 flex-1 text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          <LabeledInput
            label="New Password"
            required
            placeholder="Min. 8 characters, uppercase & number"
            secureToggle
            value={newPassword}
            hasError={!!error}
            onChangeText={(value) => {
              setNewPassword(value);
              setError('');
            }}
            editable={!loading}
          />
          <PasswordStrengthBar password={newPassword} />

          <LabeledInput
            label="Confirm Password"
            required
            placeholder="Re-enter your password"
            secureToggle
            value={confirmPassword}
            hasError={!!error && !!newPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setError('');
            }}
            editable={!loading}
          />
          <View className="mt-6">
            <PrimaryButton
              title="Reset Password"
              onPress={handleReset}
              loading={loading}
              disabled={!newPassword || !confirmPassword || loading}
            />
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}