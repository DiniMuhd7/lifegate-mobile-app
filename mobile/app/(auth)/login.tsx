import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Platform, Modal, TouchableOpacity, Image, TextInput, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

/** Authentic multi-colour Google "G" logo. */
function GoogleGLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <Path
        fill="#34A853"
        d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09c1.97 3.92 6.02 6.62 10.71 6.62z"
      />
      <Path
        fill="#FBBC05"
        d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29v-3.09h-3.98c-.8 1.61-1.27 3.43-1.27 5.38s.46 3.77 1.27 5.38l3.98-3.09z"
      />
      <Path
        fill="#EA4335"
        d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42c-2.07-1.94-4.78-3.13-8.02-3.13-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </Svg>
  );
}

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

          {/* Divider */}
          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-gray-200" />
            <Text className="mx-3 text-xs text-gray-400">or continue with</Text>
            <View className="h-px flex-1 bg-gray-200" />
          </View>

          {/* Google Sign-In */}
          <Pressable
            onPress={onGoogleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 54,
              borderRadius: 27,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#E5E7EB',
              paddingHorizontal: 18,
              // Soft, branded elevation
              shadowColor: '#1f2937',
              shadowOpacity: pressed ? 0.06 : 0.12,
              shadowRadius: pressed ? 6 : 12,
              shadowOffset: { width: 0, height: pressed ? 2 : 5 },
              elevation: pressed ? 2 : 5,
              transform: [{ scale: pressed ? 0.985 : 1 }],
              opacity: loading ? 0.85 : 1,
            })}
          >
            {/* Logo chip on the left */}
            <View
              style={{
                position: 'absolute',
                left: 8,
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#F1F5F9',
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <GoogleGLogo size={22} />
              )}
            </View>

            <Text
              style={{
                fontSize: 15.5,
                fontWeight: '700',
                color: '#1f2937',
                letterSpacing: 0.2,
              }}
            >
              {loading ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </Pressable>

          <View className="mt-6 flex-row justify-center">
            <Text className="text-sm text-gray-500">Don&apos;t have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/register-choice')}>
              <Text className="text-sm font-semibold text-[#0EA5A4]">Register</Text>
            </Pressable>
          </View>

          <Text className="mt-8 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} LifeGate by DSHub. All rights reserved.
          </Text>

          {/* DEMO ICON BUTTON 
          <TouchableOpacity
            style={{ alignItems: 'center', marginTop: 28, marginBottom: 4 }}
            onPress={() => setShowDemo(true)}
          >
            <Image source={require('assets/demo-icon.png')} style={{ width: 44, height: 44 }} />
            <Text style={{ marginTop: 6, color: '#0AADA2', fontWeight: 'bold' }}>Demo</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>Try chat as guest</Text>
          </TouchableOpacity>
*/}

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

{/*
      <Modal visible={showDemo} animationType="fade" transparent>
        <InstantMessageModal
          demoMode
          onClose={() => setShowDemo(false)}
          diagnosisId="demo"
          counterpartName="LifeGate AI Demo"
          perspective="patient"
        />
      </Modal>
*/}

    </SafeAreaView>
  );
}
