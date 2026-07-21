import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { useRegistrationStore } from 'stores/auth-store';
import { router, useFocusEffect, useRootNavigationState } from 'expo-router';
import { validateRegistration, ValidationError } from 'utils/validation';
import { InfoRow } from 'components/InfoRow';
import { Ionicons } from '@expo/vector-icons';
import { openFirstSupportedExternalUrl } from '@/utils/external-link';

export default function ReviewScreen() {
  const navigationState = useRootNavigationState();
  const { userDraft, error: backendError, loading, startRegistration, clearError } = useRegistrationStore();
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [agreed, setAgreed] = useState(false);

  const runNavigation = useCallback(
    (navigate: () => void) => {
      if (!navigationState?.key) return;
      navigate();
    },
    [navigationState?.key]
  );

  useFocusEffect(
    useCallback(() => {
      if (!userDraft.certificate || !userDraft.certificateName || !userDraft.certificateId) {
        runNavigation(() => router.replace('/(auth)/(health-professional)/license'));
      }
    }, [userDraft.certificate, userDraft.certificateName, userDraft.certificateId, runNavigation])
  );

  const handleFinalSubmit = async () => {
    if (!agreed) return;

    setValidationErrors([]);

    const errors = validateRegistration(userDraft, 'professional');
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    clearError();
    const success = await startRegistration('professional');
    if (success) {
      const { pendingRegistrationEmail } = useRegistrationStore.getState();
      runNavigation(() =>
        router.replace({
          pathname: '/(auth)/verify-signup-otp',
          params: { email: pendingRegistrationEmail },
        })
      );
    }
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="py-2">
          <Text className="mb-1 text-base font-semibold text-gray-900">Review your application</Text>
          <Text className="mb-5 text-sm text-gray-500">
            Ensure all details are accurate before submitting.
          </Text>

          {/* Backend error */}
          {backendError && (
            <View className="mb-4 flex-row items-start rounded-xl bg-red-50 p-3">
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text className="ml-2 flex-1 text-sm text-red-700">{backendError}</Text>
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

          {/* Account info card */}
          <View
            className="mb-4 overflow-hidden rounded-2xl bg-white">
            <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-[#0EA5A4]">Personal Information</Text>
              <Pressable onPress={() => router.push('/(auth)/(health-professional)')} className="flex-row items-center">
                <Ionicons name="pencil-outline" size={14} color="#0EA5A4" />
                <Text className="ml-1 text-xs font-medium text-[#0EA5A4]">Edit</Text>
              </Pressable>
            </View>
            <View className="px-4">
              <InfoRow icon="person-outline" label="Full Name" value={userDraft.name} />
              <InfoRow icon="mail-outline" label="Email" value={userDraft.email} />
              <InfoRow icon="call-outline" label="Phone" value={userDraft.phone} />
              <InfoRow icon="calendar-outline" label="Date of Birth" value={userDraft.dob} />
              <InfoRow icon="male-female-outline" label="Gender" value={userDraft.gender} />
              <InfoRow icon="language-outline" label="Language" value={userDraft.language} isLast={!userDraft.state && !userDraft.country} />
              {userDraft.state ? (
                <InfoRow icon="location-outline" label="State / Province" value={userDraft.state} isLast={!userDraft.country} />
              ) : null}
              {userDraft.country ? (
                <InfoRow icon="globe-outline" label="Country" value={userDraft.country} isLast />
              ) : null}
            </View>
          </View>

          {/* Professional details card */}
          <View
            className="mb-4 overflow-hidden rounded-2xl bg-white">
            <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-[#0EA5A4]">Professional Details</Text>
              <Pressable onPress={() => router.push('/(auth)/(health-professional)/professional')} className="flex-row items-center">
                <Ionicons name="pencil-outline" size={14} color="#0EA5A4" />
                <Text className="ml-1 text-xs font-medium text-[#0EA5A4]">Edit</Text>
              </Pressable>
            </View>
            <View className="px-4">
              <InfoRow icon="medal-outline" label="Specialization" value={userDraft.specialization} />
              <InfoRow icon="time-outline" label="Years of Practice" value={userDraft.yearsOfExperience} isLast />
            </View>
          </View>

          {/* Certification card */}
          <View
            className="mb-4 overflow-hidden rounded-2xl bg-white">
            <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-[#0EA5A4]">Certification</Text>
              <Pressable onPress={() => router.push('/(auth)/(health-professional)/license')} className="flex-row items-center">
                <Ionicons name="pencil-outline" size={14} color="#0EA5A4" />
                <Text className="ml-1 text-xs font-medium text-[#0EA5A4]">Edit</Text>
              </Pressable>
            </View>
            <View className="px-4">
              <InfoRow icon="document-text-outline" label="Certificate" value={userDraft.certificateName} />
              <InfoRow icon="id-card-outline" label="Certificate ID" value={userDraft.certificateId} />
              <InfoRow icon="calendar-outline" label="Issue Date" value={userDraft.certificateIssueDate} />
              <InfoRow
                icon="attach-outline"
                label="Certificate File"
                value={userDraft.certificate ? userDraft.certificate.name : 'Not uploaded'}
                isLast
              />
            </View>
          </View>

          {/* Admin review notice */}
          <View className="mb-4 flex-row items-start rounded-xl border border-blue-200 bg-blue-50 p-4">
            <Ionicons name="time-outline" size={18} color="#1d4ed8" style={{ marginTop: 1 }} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-semibold text-blue-800">Under Admin Review</Text>
              <Text className="mt-0.5 text-xs text-blue-700 leading-relaxed">
                Your certificate and credentials will be reviewed by the LifeGate compliance team before your account is activated. You will be notified by email once the review is complete (typically within 1–2 business days).
              </Text>
            </View>
          </View>

          {/* Fraud deterrence notice */}
          <View className="mb-6 flex-row items-start rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Ionicons name="warning-outline" size={18} color="#b45309" style={{ marginTop: 1 }} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-semibold text-amber-800">Accuracy Notice</Text>
              <Text className="mt-0.5 text-xs text-amber-700 leading-relaxed">
                All submitted credentials are verified against official medical registries. Submitting falsified or fraudulent documents is a criminal offence and will result in immediate account termination and referral for legal prosecution.
              </Text>
            </View>
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
                onPress={() => { void openFirstSupportedExternalUrl(['https://mobile.dshub.com.ng/terms', 'https://lifegate.dshub.com.ng/terms']); }}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text
                className="font-semibold text-teal-600"
                onPress={() => { void openFirstSupportedExternalUrl(['https://mobile.dshub.com.ng/privacy', 'https://lifegate.dshub.com.ng/privacy']); }}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>

          <PrimaryButton
            title={loading ? 'Submitting...' : 'Submit Application'}
            onPress={handleFinalSubmit}
            disabled={loading || !agreed}
            loading={loading}
          />

          <View className="h-8" />
        </View>
      </ScrollView>
  );
}
