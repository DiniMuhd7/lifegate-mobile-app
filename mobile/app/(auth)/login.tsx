import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Modal, TouchableOpacity, Image, TextInput } from 'react-native';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { useAuthStore } from 'stores/auth/auth-store';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Logo from 'assets/logo.svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InstantMessageModal } from 'components/InstantMessageModal';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGoogleRecoveryFab, setShowGoogleRecoveryFab] = useState(false);
  const [showAuthAlternativeModal, setShowAuthAlternativeModal] = useState(false);
  const [authAlternativeMessage, setAuthAlternativeMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showDemo, setShowDemo] = useState(false);

  const { loginDraft, setLoginField, clearLoginDraft, login, loginWithGoogle, error, clearError } = useAuthStore();

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
        const { user, pending2FA } = useAuthStore.getState();
        if (pending2FA) {
          router.push({
            pathname: '/(auth)/verify-otp',
            params: { email: pending2FA.email, mode: 'physician2fa' },
          });
        } else if (user?.role === 'professional') {
          if (user.mdcn_verified) {
            router.replace('/(prof-tab)/review');
          } else {
            router.replace('/physician-pending');
          }
        } else if (user?.role === 'admin') {
          router.replace('/(admin-tab)/dashboard');
        } else {
          router.replace('/(tab)/health');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    if (Platform.OS !== 'web') {
      setAuthAlternativeMessage(
        'Google sign-in is currently available on web only. Please log in with email and password or register a new account.'
      );
      setShowAuthAlternativeModal(true);
      return;
    }
    setShowGoogleRecoveryFab(true);
    setLoading(true);
    try {
      const success = await loginWithGoogle();
      if (success) {
        setShowGoogleRecoveryFab(false);
        const { user } = useAuthStore.getState();
        if (user?.role === 'professional') {
          router.replace(user.mdcn_verified ? '/(prof-tab)/review' : '/physician-pending');
        } else if (user?.role === 'admin') {
          router.replace('/(admin-tab)/dashboard');
        } else {
          router.replace('/(tab)/health');
        }
      } else {
        setShowGoogleRecoveryFab(false);
        const latestError = useAuthStore.getState().error ?? '';
        const isStorageStateIssue = /missing initial state|blocked required auth storage|sessionstorage/i.test(
          latestError,
        );
        if (isStorageStateIssue) {
          setAuthAlternativeMessage(
            'Google sign-in cannot continue in this browser context right now. Please log in with email and password or register a new account.'
          );
          setShowAuthAlternativeModal(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setLoading(false);
    clearError();
    router.replace('/(auth)/login');
  };

  const handleCloseAuthAlternativeModal = () => {
    setShowAuthAlternativeModal(false);
  };

  const handleGoToRegister = () => {
    setShowAuthAlternativeModal(false);
    router.push('/(auth)/register-choice');
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
        colors={["#0AADA2", "#043B3C"]}
        className="flex-1"
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.2 }}
      >
        {/* Header */}
        <View className="items-center px-6 pb-6 pt-10">
          <Logo width={64} height={64} />
          <Text className="mt-3 text-2xl font-bold text-white">Welcome Back</Text>
          <Text className="mt-1 text-sm text-white/70">Sign in to your LifeGate account</Text>
        </View>

        <ScrollView
          className="flex-1 rounded-t-[36px] bg-[#F7FEFD]"
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
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
                className={`mr-2 h-5 w-5 items-center justify-center rounded-full border-2 ${remember ? 'border-[#0EA5A4] bg-[#0EA5A4]' : 'border-gray-400'}`}
              >
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

          <Text className="mt-8 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} LifeGate by DSHub. All rights reserved.
          </Text>

          {/* DEMO ICON BUTTON */}
          <TouchableOpacity
            style={{ alignItems: 'center', marginTop: 28, marginBottom: 4 }}
            onPress={() => setShowDemo(true)}
          >
            <Image source={require('assets/demo-icon.png')} style={{ width: 44, height: 44 }} />
            <Text style={{ marginTop: 6, color: '#0AADA2', fontWeight: 'bold' }}>Demo</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>Try chat as guest</Text>
          </TouchableOpacity>

        </ScrollView>
      </LinearGradient>

      {/* Google login fallback */}
      {Platform.OS === 'web' && showGoogleRecoveryFab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to login"
          onPress={handleBackToLogin}
          className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-[#0EA5A4] shadow-xl"
          style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={showAuthAlternativeModal}
        onRequestClose={handleCloseAuthAlternativeModal}
      >
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full max-w-md rounded-2xl bg-white p-6">
            <View className="mb-3 flex-row items-center">
              <Ionicons name="information-circle" size={22} color="#0EA5A4" />
              <Text className="ml-2 text-base font-bold text-slate-900">Use Another Sign-In Method</Text>
            </View>
            <Text className="text-sm leading-6 text-slate-700">{authAlternativeMessage}</Text>
            <View className="mt-5 gap-2">
              <Pressable
                onPress={handleCloseAuthAlternativeModal}
                className="h-11 items-center justify-center rounded-xl bg-[#0EA5A4]"
              >
                <Text className="text-sm font-semibold text-white">Login with Email</Text>
              </Pressable>
              <Pressable
                onPress={handleGoToRegister}
                className="h-11 items-center justify-center rounded-xl border border-[#0EA5A4] bg-white"
              >
                <Text className="text-sm font-semibold text-[#0EA5A4]">Register Instead</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DEMO MODAL */}
      <Modal visible={showDemo} animationType="fade" transparent>
        <InstantMessageModal
          demoMode
          onClose={() => setShowDemo(false)}
          diagnosisId="demo"
          counterpartName="LifeGate AI Demo"
          perspective="patient"
        />
      </Modal>
    </SafeAreaView>
  );
}
