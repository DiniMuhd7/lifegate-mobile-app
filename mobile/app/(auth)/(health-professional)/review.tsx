import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { useRegistrationStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { validateRegistration, ValidationError } from 'utils/validation';
import { InfoRow } from 'components/InfoRow';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ReviewScreen() {
  const { userDraft, error: backendError, startRegistration, clearError } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [agreed, setAgreed] = useState(false);

  const handleFinalSubmit = async () => {
    if (!agreed) return;

    setLoading(true);
    setValidationErrors([]);

    const errors = validateRegistration(userDraft, 'professional');
    if (errors.length > 0) {
      setValidationErrors(errors);
      setLoading(false);
      return;
    }

    try {
      clearError();
      const success = await startRegistration('professional');
      if (success) {
        const { pendingRegistrationEmail } = useRegistrationStore.getState();
        router.replace({
          pathname: '/(auth)/verify-signup-otp',
          params: { email: pendingRegistrationEmail },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={['bottom']}>
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
            className="mb-4 overflow-hidden rounded-2xl bg-white"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
            <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3">
              <Text className="text-sm font-semibold text-[#0EA5A4]">Personal Information</Text>
            </View>
            <View className="p-4">
              <InfoRow label="Full Name" value={userDraft.name} />
              <InfoRow label="Email" value={userDraft.email} />
              <InfoRow label="Phone" value={userDraft.phone} />
              <InfoRow label="Date of Birth" value={userDraft.dob} />
              <InfoRow label="Gender" value={userDraft.gender} />
              <InfoRow label="Language" value={userDraft.language} />
            </View>
          </View>

          {/* Professional details card */}
          <View
            className="mb-6 overflow-hidden rounded-2xl bg-white"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
            <View className="border-b border-gray-100 bg-[#EDF9F9] px-4 py-3">
              <Text className="text-sm font-semibold text-[#0EA5A4]">Professional Details</Text>
            </View>
            <View className="p-4">
              <InfoRow label="Specialization" value={userDraft.specialization} />
              <InfoRow label="Years of Practice" value={userDraft.yearsOfExperience} />
              <InfoRow label="Certificate" value={userDraft.certificateName} />
              <InfoRow label="Certificate ID" value={userDraft.certificateId} />
              <InfoRow label="Issue Date" value={userDraft.certificateIssueDate} />
              <InfoRow
                label="Certificate File"
                value={userDraft.certificate ? userDraft.certificate.name : 'Not uploaded'}
              />
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
                onPress={() => Linking.openURL('https://www.lifegate.com/privacy-policy')}>
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
    </SafeAreaView>
  );
}
