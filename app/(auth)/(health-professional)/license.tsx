import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { ErrorMessage } from 'components/ErrorMessage';
import { Ionicons } from '@expo/vector-icons';
import { DOBInput } from 'components/DobPicker';
import { validateSingleField } from 'utils/validation';

const VALID_FIELDS = {
  certificateName: true,
  certificateId: true,
  licenseNumber: true,
  certificateIssueDate: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function LicenseScreen() {
  const { userDraft, setUserField } = useAuthStore();
  const [isAdding, setIsAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, true);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, true);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
    console.log('New Date set:', new_date);
  };

  if (!isAdding) {
    // --- EMPTY STATE (Add Certification Screen) ---
    return (
      <View className="flex-1 bg-white p-6">
        <Text className="mb-4 text-lg font-medium text-[#475569]">Add Certification</Text>

        <TouchableOpacity
          onPress={() => setIsAdding(true)}
          className="items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-[#F1F5F9] py-12">
          <View className="flex-row items-center">
            <Ionicons name="add" size={20} color="#64748b" />
            <Text className="ml-1 font-medium text-[#64748b]">Add Certificate</Text>
          </View>
        </TouchableOpacity>

        <Text className="mt-12 px-10 text-center text-base italic text-[#64748b]">
          Certification helps patients trust you.
        </Text>
      </View>
    );
  }

  // --- FORM STATE (Certification Details Screen) ---
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24 }}>
      <LabeledInput
        label="Certificate Name"
        required
        placeholder="Type certificate name"
        value={userDraft.certificateName}
        onChangeText={(v) => handleFieldChange('certificateName', v)}
      />
      <ErrorMessage fieldName="certificateName" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Certificate ID"
        required
        placeholder="Type certificate ID"
        value={userDraft.certificateId}
        onChangeText={(v) => handleFieldChange('certificateId', v)}
      />
      <ErrorMessage fieldName="certificateId" fieldErrors={fieldErrors} />

      <LabeledInput
        label='License Id'
        required
        placeholder="Type license ID"
        value={userDraft.licenseNumber}
        onChangeText={(v) => handleFieldChange('licenseNumber', v)}
      />
      <ErrorMessage fieldName="licenseNumber" fieldErrors={fieldErrors} />

      <DOBInput
        label="Issue Date"
        value={userDraft.certificateIssueDate ? new Date(userDraft.certificateIssueDate) : null}
        onChange={(date: Date) => handleDateChange('certificateIssueDate', date)}
      />
      <ErrorMessage fieldName="certificateIssueDate" fieldErrors={fieldErrors} />

      <View className="mb-6">
        <Text className="mb-2 font-medium text-[#475569]">
          Select Certificate Type <Text className="text-red-500">*</Text>
        </Text>
        <TouchableOpacity className="flex-row items-center justify-between rounded-xl bg-[#F1F5F9] p-4">
          <Text className="text-gray-400">Select Certificate Type</Text>
          <Ionicons name="chevron-down" size={20} color="#475569" />
        </TouchableOpacity>
      </View>

      <View className="mb-8">
        <Text className="mb-2 font-medium text-[#475569]">
          Attachment <Text className="text-red-500">*</Text>
        </Text>
        <TouchableOpacity className="items-center rounded-2xl border border-gray-100 bg-[#F1F5F9] py-10">
          <Ionicons name="cloud-upload-outline" size={30} color="#64748b" />
          <Text className="mt-2 text-[#64748b]">Upload Certificate</Text>
          <Text className="text-xs text-[#94a3b8]">PDF or Image</Text>
        </TouchableOpacity>
      </View>

      <PrimaryButton
        title="Next"
        onPress={() => router.push('/(auth)/(health-professional)/review')}
        type="secondary"
      />

      <View className="h-10" />
    </ScrollView>
  );
}
