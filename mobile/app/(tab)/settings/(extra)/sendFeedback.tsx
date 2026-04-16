import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dropdown } from '@/components/DropDown';
import { issues } from '@/constants/constants';
import { useAuthStore } from 'stores/auth/auth-store';
import { SupportService } from 'services/support-service';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SendFeedbackScreen() {
  const user = useAuthStore((state) => state.user);
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [lifegateId, setLifegateId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!lifegateId) {
      setLifegateId(user?.patient_id || user?.user_id || '');
    }
    if (!contactEmail) {
      setContactEmail(user?.email || '');
    }
  }, [user, lifegateId, contactEmail]);

  const handleSubmit = async () => {
    if (!issueType.trim() || !description.trim() || !contactEmail.trim()) {
      Alert.alert('Missing Information', 'Issue type, email, and description are required.');
      return;
    }

    setSuccessMessage('');

    setSubmitting(true);
    const result = await SupportService.contactSupport({
      contactName: user?.name,
      contactEmail: contactEmail.trim(),
      lifeGateId: lifegateId.trim(),
      issueType: issueType.trim(),
      description: description.trim(),
    });
    setSubmitting(false);

    if (!result.success) {
      Alert.alert('Unable to Send', result.message || 'Please try again.');
      return;
    }

    const successText = result.data?.referenceId
      ? `Feedback submitted successfully. Reference ID: ${result.data.referenceId}.`
      : 'Feedback submitted successfully.';

    setSuccessMessage(successText);

    setIssueType('');
    setDescription('');

    Alert.alert('Success', successText, [
      {
        text: 'OK',
        onPress: () => {
          router.replace({
            pathname: '/(tab)/settings/help-center',
            params: {
              feedback: 'sent',
              referenceId: result.data?.referenceId || '',
            },
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={24} color="#1f2937" />
        </Pressable>

        <Text className="text-xl font-black text-gray-900">Contact Support</Text>

        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4 mb-4">
          <Text className="text-sm text-gray-700 leading-5">
            Send a detailed support request and our team will follow up by email.
          </Text>
        </View>

        {successMessage ? (
          <View className="rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] px-4 py-3 mb-4">
            <View className="flex-row items-start gap-2">
              <Ionicons name="checkmark-circle" size={18} color="#059669" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-sm text-[#065F46] leading-5">{successMessage}</Text>
            </View>
          </View>
        ) : null}

        <View className="bg-white rounded-2xl border border-[#E4EEEE] p-4">
          <Dropdown
            label="Type of Issue"
            placeholder="Select type of issue"
            options={issues}
            selectedValue={issueType}
            onChange={(value: string) => setIssueType(value)}
            triggerClassName="bg-[#F4FAFA] border border-[#DFEFEF]"
          />

          <Text className="text-[14px] text-gray-700 mb-2">Contact Email</Text>
          <TextInput
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder="Enter your email address"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            className="bg-[#F4FAFA] rounded-xl border border-[#DFEFEF] px-4 py-3 h-14 text-[13px] text-gray-800 mb-4"
          />

          <Text className="text-[14px] text-gray-700 mb-2">Issue Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue, what happened, and what you expected"
            placeholderTextColor="#9ca3af"
            multiline
            className="bg-[#F4FAFA] rounded-xl border border-[#DFEFEF] px-4 py-3 text-[13px] text-gray-800 h-32 mb-4"
            textAlignVertical="top"
          />

          <Text className="text-[14px] text-gray-700 mb-2">LifeGate ID</Text>
          <TextInput
            value={lifegateId}
            onChangeText={setLifegateId}
            placeholder="Enter your LifeGate ID"
            placeholderTextColor="#9ca3af"
            className="bg-[#F4FAFA] rounded-xl border border-[#DFEFEF] px-4 py-3 h-14 text-[13px] text-gray-800"
          />
        </View>
      </ScrollView>

      <View className="px-6 pb-10 pt-3 bg-[#F2F8F8]">
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className={`rounded-full py-4 items-center ${submitting ? 'bg-[#6CBDB8]' : 'bg-[#38887D]'}`}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-[16px] font-medium">Send Support Request</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}