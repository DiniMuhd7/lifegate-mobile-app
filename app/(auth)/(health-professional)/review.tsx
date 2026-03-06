import React, { useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView, Linking } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { SubmissionModal } from 'components/SubmissionModal';
import { useAuthStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { validateRegistration } from 'utils/validation';
import { InfoRow } from 'components/infoRow';

export default function ReviewScreen() {
  const { userDraft, register, error: backendError } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const handleFinalSubmit = async () => {
    setLoading(true);
    setValidationErrors([]);

    // Pre-validation before submission
    const errors = validateRegistration(userDraft, 'professional');
    if (errors.length > 0) {
      setValidationErrors(errors);
      const errorMessages = errors.map((err) => err.message).join('\n');
      Alert.alert('Validation Error', errorMessages);
      setLoading(false);
      return;
    }

    try {
      await register('professional');
      // If no error was set, registration succeeded
      const { error } = useAuthStore.getState();
      if (!error) {
        setSubmissionSuccess(true);
      } else {
        setSubmissionSuccess(false);
      }
      setModalVisible(true);
    } catch (error) {
      console.error('Registration failed', error);
      setSubmissionSuccess(false);
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleModalConfirm = () => {
    setModalVisible(false);
    if (submissionSuccess) {
      router.replace('/(auth)/login');
    }
  };

  return (
    <ScrollView className="flex-1 px-6 py-4">
      <Text className="mb-6 mt-4 text-lg font-semibold">
        Review your information and submit your application.
      </Text>

      {backendError && (
        <View className="mb-6 rounded-lg border border-red-400 bg-red-100 p-4">
          <Text className="text-center text-red-700">{backendError}</Text>
        </View>
      )}

      {validationErrors.length > 0 && (
        <View className="mb-6 p-2">
          {validationErrors.map((err, idx) => (
            <Text key={idx} className="text-sm text-red-600">
              • {err.message}
            </Text>
          ))}
        </View>
      )}

      {/* Summary of filled details */}
      <View className="mb-6 w-full rounded-lg bg-gray-100 p-4 px-3">
        <InfoRow label="Name" value={userDraft.name} />
        <InfoRow label="Phone" value={userDraft.phone} />
        <InfoRow label="Date of Birth" value={userDraft.dob} />
        <InfoRow label="Gender" value={userDraft.gender} />
        <InfoRow label="Specialization" value={userDraft.specialization} />
        <InfoRow label="License Number" value={userDraft.licenseNumber} />
        <InfoRow label="Years of Experience" value={userDraft.yearsOfExperience} />
        <InfoRow label="Certificate" value={userDraft.certificateName} />
        <InfoRow label="Language" value={userDraft.language} />
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
        title={loading ? 'Submitting...' : 'Submit Application'}
        onPress={handleFinalSubmit}
        disabled={loading}
      />
      {modalVisible && (
        <SubmissionModal
          visible={modalVisible}
          isSuccess={submissionSuccess}
          title={submissionSuccess ? 'Application Submitted' : 'Submission Failed'}
          message={
            submissionSuccess
              ? "We've received your application. We'll get back to you soon!"
              : backendError || 'An error occurred. Please try again.'
          }
          onConfirm={handleModalConfirm}
          confirmButtonText={submissionSuccess ? 'Go to Login' : 'Try Again'}
        />
      )}
    </ScrollView>
  );
}
