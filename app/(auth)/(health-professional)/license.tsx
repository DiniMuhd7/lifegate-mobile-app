import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryCalendar } from 'components/Calender';

export default function LicenseScreen() {
  const { healthProfessionalDraft, setHealthProfessionalField } = useAuthStore();
  const [isAdding, setIsAdding] = useState(false);

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
        placeholder="Type certificate name"
        value={healthProfessionalDraft.certificateName}
        onChangeText={(v) => setHealthProfessionalField('certificateName', v)}
        // If LabeledInput supports an asterisk prop, use it here
      />

      <LabeledInput
        label="Certificate ID"
        placeholder="Type certificate ID"
        value={healthProfessionalDraft.certificateId}
        onChangeText={(v) => setHealthProfessionalField('certificateId', v)}
      />

      <PrimaryCalendar
        label="Issue Date"
        value={healthProfessionalDraft.certificateIssueDate}
        onChange={(date: string) => setHealthProfessionalField('certificateIssueDate', date)}
      />

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
