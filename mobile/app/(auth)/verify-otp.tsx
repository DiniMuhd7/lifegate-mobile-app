import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePasswordRecoveryStore } from 'stores/auth/password-recovery-store';
import { useRegistrationStore } from 'stores/auth/registration-store';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifyOtpScreen() {
  const { email, mode } = useLocalSearchParams<{ email: string; mode: string }>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const otpString = otp.join('');
  const isComplete = otpString.length === 6;

  const handleVerify = async () => {
    if (!isComplete) {
      setError('Please enter all 6 digits');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'passwordReset') {
        const { verifyOtpForPasswordRecovery } = usePasswordRecoveryStore.getState();
        const success = await verifyOtpForPasswordRecovery(email, otpString);
        if (success) {
          const token = usePasswordRecoveryStore.getState().resetToken;
          router.push({ pathname: '/(auth)/reset-password', params: { token } });
        } else {
          const { error: storeError } = usePasswordRecoveryStore.getState();
          setError(storeError || 'Invalid verification code');
        }
      } else if (mode === 'signup') {
        const { verifyRegistration } = useRegistrationStore.getState();
        const success = await verifyRegistration(email, otpString);
        if (success) {
          router.push({ pathname: '/(auth)/(user)/profile', params: { emailVerified: 'true' } });
        } else {
          const { error: storeError } = useRegistrationStore.getState();
          setError(storeError || 'Invalid verification code');
        }
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError('');
    try {
      if (mode === 'passwordReset') {
        const { resendOtp } = usePasswordRecoveryStore.getState();
        const success = await resendOtp(email, 'password-reset');
        if (success) {
          setOtp(['', '', '', '', '', '']);
          setResendCooldown(60);
          inputRefs.current[0]?.focus();
        } else {
          const { error: storeError } = usePasswordRecoveryStore.getState();
          setError(storeError || 'Failed to resend code');
        }
      } else if (mode === 'signup') {
        const { resendRegistrationOTP } = useRegistrationStore.getState();
        const success = await resendRegistrationOTP(email);
        if (success) {
          setOtp(['', '', '', '', '', '']);
          setResendCooldown(60);
          inputRefs.current[0]?.focus();
        } else {
          const { error: storeError } = useRegistrationStore.getState();
          setError(storeError || 'Failed to resend code');
        }
      }
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const iconName: keyof typeof Ionicons.glyphMap =
    mode === 'passwordReset' ? 'lock-closed-outline' : 'mail-outline';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={['#0AADA2', '#043B3C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.2 }}
        style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-6 pt-6">
          <Pressable onPress={() => router.back()} className="p-2">
            <Ionicons name="chevron-back" size={24} color="white" />
          </Pressable>
          <Text className="flex-1 text-center text-xl font-bold text-white">
            {mode === 'passwordReset' ? 'Verify Reset Code' : 'Verify Email'}
          </Text>
          <View className="w-10" />
        </View>

        {/* Content Card */}
        <ScrollView
          className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
          contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 40, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          {/* Icon */}
          <View className="mb-4 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-[#EDF9F9]">
              <Ionicons name={iconName} size={30} color="#0EA5A4" />
            </View>
          </View>

          <Text className="mb-2 text-center text-2xl font-bold text-gray-900">
            Enter Your Code
          </Text>
          <Text className="mb-8 text-center text-sm text-gray-500">
            We sent a 6-digit code to{'\n'}
            <Text className="font-semibold text-gray-700">{email}</Text>
          </Text>

          {/* Error */}
          {error ? (
            <View className="mb-5 flex-row items-start rounded-xl bg-red-50 p-3">
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text className="ml-2 flex-1 text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {/* OTP Input Boxes */}
          <View className="mb-6 flex-row justify-center gap-3">
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                maxLength={1}
                keyboardType="number-pad"
                value={digit}
                onChangeText={(value) => handleOtpChange(index, value)}
                onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                className={`h-14 w-12 rounded-xl border-2 text-center text-2xl font-bold ${
                  digit
                    ? 'border-[#0EA5A4] bg-[#EDF9F9] text-[#0EA5A4]'
                    : 'border-gray-200 bg-gray-50 text-gray-900'
                }`}
                placeholderTextColor="#D1D5DB"
                editable={!loading}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* Verify Button */}
          <View className="mb-5">
            <PrimaryButton
              title="Verify"
              onPress={handleVerify}
              loading={loading}
              disabled={!isComplete || loading}
            />
          </View>

          {/* Resend */}
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-sm text-gray-500">Didn&apos;t receive the code?</Text>
            <Pressable
              onPress={handleResend}
              disabled={resendLoading || loading || resendCooldown > 0}
              className="p-1">
              <Text
                className={`text-sm font-semibold ${
                  resendLoading || loading || resendCooldown > 0 ? 'text-gray-400' : 'text-[#0EA5A4]'
                }`}>
                {resendLoading
                  ? 'Sending...'
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend Code'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}
