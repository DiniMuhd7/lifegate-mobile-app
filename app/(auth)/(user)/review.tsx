import React, { useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView, Linking } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { useRegistrationStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { validateRegistration } from 'utils/validation';
import { InfoRow } from 'components/infoRow';

export default function UserReviewStep() {
  const { userDraft, error: backendError, startRegistration, clearError } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [agreed, setAgreed] = useState(false);

  const handleFinalSubmit = async () => {
    if (!agreed) {
      Alert.alert('Agreement Required', 'Please agree to the Privacy Policy.');
      return;

    }

    setLoading(true);
    setValidationErrors([]);
    // Pre-validation before submission
    
    const errors = validateRegistration(userDraft, 'user');
    try {
      clearError();
      const success = await startRegistration('user');

      if (success) {
        // Get pending email from store
        const { pendingRegistrationEmail } = useRegistrationStore.getState();
        // Navigate to OTP verification
        router.replace({
          pathname: '/(auth)/verify-signup-otp',
          params: { email: pendingRegistrationEmail },
        });
      } else {
        // Error is already in store
        // Alert.alert('Registration Failed', backendError || 'An error occurred. Please try again.');
      }
    } catch (error) {
      // console.error('Registration failed', error);
      // Alert.alert('Registration Failed', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 px-6">
      <Text className="mb-3 mt-4 text-center text-lg font-semibold">
        Review your information before submitting.
      </Text>AB

      {backendError && (
        <View className="mb-3">
          <Text className="text-center text-red-700">
            {typeof backendError === 'string' ? backendError : backendError.message}
          </Text>
        </View>
      )}

      {validationErrors.length > 0 && (
        <View className="mb-6 rounded-lg border border-red-300 bg-red-100 p-4">
          <Text className="mb-2 font-semibold text-red-700">Validation Errors:</Text>
          {validationErrors.map((err, idx) => (
            <Text key={idx} className="text-sm text-red-600">
              • {err.message}
            </Text>
          ))}
        </View>
      )}

      <View className="mb-16 rounded-lg bg-[#F2F4F7] p-4">
        <InfoRow label="Full Name" value={userDraft.name} />
        <InfoRow label="Email" value={userDraft.email} />
        <InfoRow label="Phone Number" value={userDraft.phone} />
        <InfoRow label="Date of Birth" value={userDraft.dob} />
        <InfoRow label="Gender" value={userDraft.gender} />
        <InfoRow label="Language" value={userDraft.language} />
        <View className="mb-3 flex-col justify-between px-3">
          <Text className="max-w-[55%] text-left font-medium text-gray-800">History:</Text>
          <Text lineBreakMode="head" className="max-w-[100%] flex-1 text-left text-gray-800">
            {userDraft.healthHistory}
          </Text>
        </View>
      </View>
      <Text className="mb-6 text-center font-light">
        I have the information is accurate and I consent to the lifeGate Privacy and policy
      </Text>

      <View className="mt-15 flex-row justify-center">
        <Pressable onPress={() => setAgreed(!agreed)} className="mb-8 flex-row items-center">
          {/* Outer Circle */}
          <View
            className={`mr-3 h-5 w-5 items-center justify-center rounded-full border-2 ${
              agreed ? 'border-teal-600' : 'border-gray-400'
            }`}>
            {/* Inner Circle (only when active) */}
            {agreed && <View className="h-2.5 w-2.5 rounded-full bg-teal-600" />}
          </View>

          <Text className="font-bold text-gray-700">
            I have read the{' '}
            <Text
              className="font-semibold text-teal-600"
              onPress={() => Linking.openURL('https://www.lifegate.com/privacy-policy')}>
              Privacy Policy
            </Text>{' '}
            and I agree.
          </Text>
        </Pressable>
      </View>

      <PrimaryButton
        title={loading ? 'Creating Account...' : 'Create Account'}
        onPress={handleFinalSubmit}
        disabled={loading}
      />

      {/* {modalVisible && (
        <SubmissionModal
          visible={modalVisible}
          isSuccess={submissionSuccess}
          title={submissionSuccess ? 'Submission In Progress' : 'Submission Failed'}
          message={
            submissionSuccess
              ? "Sending verification code to your email..."
              : backendError || 'An error occurred. Please try again.'
          }
          onConfirm={handleModalConfirm}
          confirmButtonText={submissionSuccess ? 'Sent!' : 'Try Again'}
        />
      )} */}
    </ScrollView>
  );
}
