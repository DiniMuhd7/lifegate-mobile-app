import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from 'stores/auth-store';

export default function VerifySignupOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { otpExpiresIn } = useAuthStore();

  // Initialize countdown timer
  useEffect(() => {
    if (otpExpiresIn && otpExpiresIn > 0) {
      setTimeRemaining(otpExpiresIn);
    }
  }, [otpExpiresIn]);

  // Countdown timer effect
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [timeRemaining]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    // Handle backspace
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

    if (!email) {
      setError('Email information missing. Please try again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { verifyRegistration } = useAuthStore.getState();
      const success = await verifyRegistration(email, otpString);

      if (success) {
        // User is now logged in - navigate to authenticated home screen
        router.replace('/(tab)/chatScreen');
      } else {
        const { error: storeError } = useAuthStore.getState();
        setError(storeError || 'Verification failed');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      console.error('OTP verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Email information missing. Cannot resend OTP.');
      return;
    }

    setResendLoading(true);
    setError('');

    try {
      const { resendRegistrationOTP } = useAuthStore.getState();
      const success = await resendRegistrationOTP(email);

      if (success) {
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setError(''); // Clear any previous errors
      } else {
        const { error: storeError } = useAuthStore.getState();
        setError(storeError || 'Failed to resend code');
      }
    } catch (err) {
      setError('Failed to resend code. Please try again.');
      console.error('Resend OTP error:', err);
    } finally {
      setResendLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.2 }}
      style={{ flex: 1 }}>
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-24 pb-6">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text className="flex-1 text-center text-xl font-bold text-white">
          Verify Email
        </Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-12 pt-12">
        <Text className="mb-2 text-center text-2xl font-bold text-gray-900">
          Verify Your Email
        </Text>
        <Text className="mb-8 text-center text-base text-gray-600">
          Enter 6-digit verification code sent to {email}
        </Text>

        {/* Error Message */}
        {error && (
          <View className="mb-6 rounded-lg border border-red-400 bg-red-100 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {/* OTP Input Boxes (6 digits) */}
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
              placeholder=""
              className="h-16 w-12 rounded-lg border-2 border-gray-300 text-center text-2xl font-bold text-gray-900"
              placeholderTextColor="#D1D5DB"
              editable={!loading}
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Countdown Timer */}
        {timeRemaining !== null && timeRemaining > 0 && (
          <View className="mb-6 items-center">
            <Text className="text-sm text-gray-600">
              Code expires in:{' '}
              <Text className={`font-semibold ${timeRemaining < 60 ? 'text-red-600' : 'text-gray-900'}`}>
                {formatTime(timeRemaining)}
              </Text>
            </Text>
          </View>
        )}

        {/* Verify Button */}
        <View className="mb-6">
          <PrimaryButton
            title="Verify & Continue"
            onPress={handleVerify}
            loading={loading}
            disabled={!isComplete}
          />
        </View>

        {/* Resend Code Link */}
        <View className="flex-row items-center justify-center gap-2">
          <Text className="text-sm text-gray-600">Didn&apos;t you receive code?</Text>
          <Pressable
            onPress={handleResend}
            disabled={resendLoading || loading}
            className="p-1">
            <Text
              className={`text-sm font-semibold ${
                resendLoading || loading ? 'text-gray-400' : 'text-[#0EA5A4]'
              }`}>
              {resendLoading ? 'Sending...' : 'Resend Code'}
            </Text>
          </Pressable>
        </View>

        {/* Bottom spacing */}
        <View className="h-8" />
      </ScrollView>
    </LinearGradient>
  );
}
