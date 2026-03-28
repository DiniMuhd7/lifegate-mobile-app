import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useRegistrationStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { ErrorMessage } from 'components/ErrorMessage';
import { Ionicons } from '@expo/vector-icons';
import { DOBInput } from 'components/DobPicker';
import { validateSingleField } from 'utils/validation';
import * as DocumentPicker from 'expo-document-picker';

const VALID_FIELDS = {
  certificateName: true,
  certificateId: true,
  certificateIssueDate: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function LicenseScreen() {
  const { userDraft, setUserField, setCertificateFile } = useRegistrationStore();
  const [isAdding, setIsAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [certificateError, setCertificateError] = useState<string>('');

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, true);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

// Add this function in the component
const canProceed = () => {
  // Check all required fields are filled
  const hasAllTextFields = 
    userDraft.certificateName &&
    userDraft.certificateId &&
    userDraft.certificateIssueDate;
  
  // Check certificate file is uploaded
  const hasCertificateFile = !!userDraft.certificate;
  
  return hasAllTextFields && hasCertificateFile;
};  

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, true);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

const handlePickCertificate = async () => {
  try {
    setCertificateError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    // Validate size < 5MB
    const maxSize = 5 * 1024 * 1024;
    if (asset.size && asset.size > maxSize) {
      setCertificateError('File size must be less than 5MB');
      return;
    }

    // Prepare file for FormData
    const fileObject = {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || 'application/octet-stream',
    };

    setCertificateFile(fileObject as never);
  } catch (err) {
    console.error('File pick error:', err);
    setCertificateError('Failed to pick file');
  }
};

  const handleRemoveCertificate = () => {
    setCertificateFile(null);
    setCertificateError('');
  };

  if (!isAdding) {
    const hasCertificate =
      userDraft.certificate && userDraft.certificateName && userDraft.certificateId;

    if (hasCertificate) {
      // Show uploaded summary with edit + continue options
      return (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 0 }}>
          <View className="py-2">
            <Text className="mb-4 text-lg font-medium text-gray-700">Certification</Text>

            <View className="mb-4 rounded-2xl border border-green-300 bg-green-50 p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-row flex-1 items-start">
                  <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-green-800">{userDraft.certificateName}</Text>
                    <Text className="mt-0.5 text-sm text-green-700">
                      ID: {userDraft.certificateId}
                    </Text>
                    {userDraft.certificateIssueDate ? (
                      <Text className="mt-0.5 text-sm text-green-700">
                        Issued: {userDraft.certificateIssueDate}
                      </Text>
                    ) : null}
                    {userDraft.certificate?.name ? (
                      <Text className="mt-0.5 text-sm text-green-600">
                        📄 {userDraft.certificate.name}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity onPress={() => setIsAdding(true)} className="p-1">
                  <Ionicons name="pencil-outline" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <PrimaryButton
              title="Continue"
              onPress={() => router.push('/(auth)/(health-professional)/review')}
              type="secondary"
            />
          </View>
        </ScrollView>
      );
    }

    // Empty state — no certificate yet
    return (
      <View className="flex-1 py-2">
        <Text className="mb-4 text-lg font-medium text-gray-700">Add Certification</Text>
        <TouchableOpacity
          onPress={() => setIsAdding(true)}
          className="items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-[#F1F5F9] py-14">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#EDF9F9]">
            <Ionicons name="ribbon-outline" size={28} color="#0EA5A4" />
          </View>
          <Text className="mt-3 font-semibold text-gray-600">Add Your Certificate</Text>
          <Text className="mt-1 text-sm text-gray-400">PDF, JPEG, or PNG · Max 5 MB</Text>
        </TouchableOpacity>
        <Text className="mt-8 text-center text-sm italic text-gray-400">
          Certification builds trust with your patients.
        </Text>
      </View>
    );
  }

  // --- FORM STATE (Certification Details) ---
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 0, paddingBottom: 32 }}>
      <View className="py-2">
        <LabeledInput
          label="Certificate Name"
          required
          placeholder="e.g. MBBS, FMCP, MD"
          value={userDraft.certificateName}
          hasError={!!fieldErrors.certificateName}
          onChangeText={(v) => handleFieldChange('certificateName', v)}
        />
        <ErrorMessage fieldName="certificateName" fieldErrors={fieldErrors} />

        <LabeledInput
          label="Certificate ID / Licence Number"
          required
          placeholder="Enter the official certificate ID"
          value={userDraft.certificateId}
          hasError={!!fieldErrors.certificateId}
          onChangeText={(v) => handleFieldChange('certificateId', v)}
        />
        <ErrorMessage fieldName="certificateId" fieldErrors={fieldErrors} />

        <DOBInput
          label="Issue Date"
          value={userDraft.certificateIssueDate ? new Date(userDraft.certificateIssueDate) : null}
          onChange={(date: Date) => handleDateChange('certificateIssueDate', date)}
        />
        <ErrorMessage fieldName="certificateIssueDate" fieldErrors={fieldErrors} />

        {/* File upload */}
        <View className="mb-6">
          <Text className="mb-2 font-medium text-gray-700">
            Certificate File <Text className="text-red-500">*</Text>
          </Text>

          {userDraft.certificate ? (
            <View className="rounded-2xl border border-green-300 bg-green-50 p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 flex-row items-center">
                  <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-green-700">File uploaded</Text>
                    <Text className="text-sm text-green-600">{userDraft.certificate.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleRemoveCertificate} className="p-1">
                  <Ionicons name="close-circle" size={24} color="#dc2626" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handlePickCertificate}
              className="items-center rounded-2xl border border-dashed border-gray-300 bg-[#F1F5F9] py-10">
              <Ionicons name="cloud-upload-outline" size={32} color="#64748b" />
              <Text className="mt-2 font-medium text-gray-600">Upload Certificate</Text>
              <Text className="mt-0.5 text-xs text-gray-400">PDF, JPEG, or PNG · Max 5 MB</Text>
            </TouchableOpacity>
          )}

          {certificateError ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text className="ml-1 text-xs text-red-500">{certificateError}</Text>
            </View>
          ) : null}
        </View>

        <PrimaryButton
          title="Continue"
          onPress={() => router.push('/(auth)/(health-professional)/review')}
          type="secondary"
          disabled={!canProceed()}
        />
      </View>
    </ScrollView>
  );
}
