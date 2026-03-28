import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRegistrationStore } from 'stores/auth/registration-store';
import { useAuthStore } from 'stores/auth-store';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifySignupOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { otpExpiresIn } = useRegistrationStore();

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
      const { verifyRegistration } = useRegistrationStore.getState();
      const success = await verifyRegistration(email, otpString);

      if (success) {
        // Role is preserved in userDraft after verifyRegistration clears the form.
        // Auth store is also populated with the verified user at this point.
        const { userDraft } = useRegistrationStore.getState();
        const { user } = useAuthStore.getState();
        const userRole = user?.role ?? userDraft.role;

        if (userRole === 'professional') {
          // Route professional users to their review/consultation screen
          router.replace('/(prof-tab)/consultation');
        } else {
          // Route regular users to chat screen
          router.replace('/(tab)/chatScreen');
        }
      } else {
        const { error: storeError } = useRegistrationStore.getState();
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
      const { resendRegistrationOTP } = useRegistrationStore.getState();
      const success = await resendRegistrationOTP(email);

      if (success) {
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setError(''); // Clear any previous errors
      } else {
        const { error: storeError } = useRegistrationStore.getState();
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
        <Text className="flex-1 text-center text-xl font-bold text-white">Verify Email</Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
        contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 40, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <View className="mb-3 items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-[#EDF9F9]">
            <Ionicons name="mail-outline" size={32} color="#0EA5A4" />
          </View>
        </View>
        <Text className="mb-2 text-center text-2xl font-bold text-gray-900">Check Your Email</Text>
        <Text className="mb-8 text-center text-sm text-gray-500">
          We sent a 6-digit code to{'\n'}
          <Text className="font-semibold text-gray-700">{email}</Text>
        </Text>

        {/* Error Message */}
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

        {/* Countdown Timer */}
        {timeRemaining !== null && timeRemaining > 0 ? (
          <View className="mb-6 items-center">
            <Text className="text-sm text-gray-500">
              Code expires in{' '}
              <Text
                className={`font-semibold ${timeRemaining < 60 ? 'text-red-500' : 'text-gray-800'}`}>
                {formatTime(timeRemaining)}
              </Text>
            </Text>
          </View>
        ) : null}

        {/* Verify Button */}
        <View className="mb-5">
          <PrimaryButton
            title="Verify & Continue"
            onPress={handleVerify}
            loading={loading}
            disabled={!isComplete || loading}
          />
        </View>

        {/* Resend Code */}
        <View className="flex-row items-center justify-center gap-1">
          <Text className="text-sm text-gray-500">Didn&apos;t receive the code?</Text>
          <Pressable onPress={handleResend} disabled={resendLoading || loading} className="p-1">
            <Text
              className={`text-sm font-semibold ${
                resendLoading || loading ? 'text-gray-400' : 'text-[#0EA5A4]'
              }`}>
              {resendLoading ? 'Sending...' : 'Resend'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
    </SafeAreaView>
  );
}
