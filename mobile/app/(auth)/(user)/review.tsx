import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { useRegistrationStore } from 'stores/auth-store';
import { router, useFocusEffect } from 'expo-router';
import { validateRegistration, ValidationError } from 'utils/validation';
import { InfoRow } from 'components/InfoRow';
import { Ionicons } from '@expo/vector-icons';

export default function UserReviewStep() {
  const { userDraft, error: backendError, loading, startRegistration, clearError } = useRegistrationStore();
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [agreed, setAgreed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userDraft.phone || !userDraft.dob || !userDraft.gender) {
        router.replace('/(auth)/(user)/profile');
      }
    }, [userDraft.phone, userDraft.dob, userDraft.gender])
  );

  const handleFinalSubmit = async () => {
    if (!agreed) return;

    setValidationErrors([]);

    const errors = validateRegistration(userDraft, 'user');
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    clearError();
    const success = await startRegistration('user');
    if (success) {
      const { pendingRegistrationEmail } = useRegistrationStore.getState();
      router.replace({
        pathname: '/(auth)/verify-signup-otp',
        params: { email: pendingRegistrationEmail },
      });
    }
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
        <Text className="mb-1 text-base font-semibold text-gray-900">Review your details</Text>
        <Text className="mb-5 text-sm text-gray-500">
          Make sure everything looks correct before submitting.
        </Text>

        {/* Backend error */}
        {backendError && (
          <View className="mb-4 flex-row items-start rounded-xl bg-red-50 p-3">
            <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
            <Text className="ml-2 flex-1 text-sm text-red-700">
              {typeof backendError === 'string' ? backendError : String(backendError)}
            </Text>
          </View>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <Text className="mb-2 text-sm font-semibold text-red-700">Please fix the following:</Text>
            {validationErrors.map((err, idx) => (
              <Text key={idx} className="text-sm text-red-600">
                • {err.message}
              </Text>
            ))}
          </View>
        )}

        {/* Summary card */}
        <View className="mb-6 overflow-hidden rounded-2xl bg-white"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
          <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-[#0EA5A4]">Personal Information</Text>
            <Pressable onPress={() => router.push('/(auth)/(user)/profile')} className="flex-row items-center">
              <Ionicons name="pencil-outline" size={14} color="#0EA5A4" />
              <Text className="ml-1 text-xs font-medium text-[#0EA5A4]">Edit</Text>
            </Pressable>
            <InfoRow label="Email" value={userDraft.email} />
            <InfoRow label="Phone" value={userDraft.phone} />
            <InfoRow label="Date of Birth" value={userDraft.dob} />
            <InfoRow label="Gender" value={userDraft.gender} />
            <InfoRow label="Language" value={userDraft.language} />
          </View>
          {userDraft.healthHistory ? (
            <>
              <View className="border-t border-gray-100 bg-[#EDF9F9] px-4 py-3">
                <Text className="text-sm font-semibold text-[#0EA5A4]">Health History</Text>
              </View>
              <View className="p-4">
                <Text className="text-sm text-gray-800">{userDraft.healthHistory}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Privacy agreement */}
        <Pressable
          onPress={() => setAgreed(!agreed)}
          className="mb-6 flex-row items-start rounded-xl bg-gray-50 p-4">
          <View
            className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${
              agreed ? 'border-teal-600 bg-teal-600' : 'border-gray-400'
            }`}>
            {agreed && <Ionicons name="checkmark" size={12} color="white" />}
          </View>
          <Text className="ml-3 flex-1 text-sm text-gray-700">
            I confirm the information above is accurate and agree to the{' '}
            <Text
              className="font-semibold text-teal-600"
              onPress={() => Linking.openURL('https://www.lifegate.com/terms')}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              className="font-semibold text-teal-600"
              onPress={() => Linking.openURL('https://www.lifegate.com/privacy-policy')}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Pressable>

        <PrimaryButton
          title={loading ? 'Creating Account...' : 'Create Account'}
          onPress={handleFinalSubmit}
          disabled={loading || !agreed}
          loading={loading}
        />

        <View className="h-8" />
      </View>
    </ScrollView>
  );
}
