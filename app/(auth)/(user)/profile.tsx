import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { useAuthStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { DOBInput } from 'components/DobPicker';
import { PhoneNumberInput } from 'components/PhoneInput';
import { validateSingleField } from 'utils/validation';

const VALID_FIELDS = {
  phone: true,
  dob: true,
  gender: true,
  healthHistory: true,
  language: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function UserProfileStep() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, false);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, false);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
    console.log('New Date set:', new_date);
  };

  return (
    <View className="px-6">
      {/* <LabeledInput
        label="Phone Number"
        required
        placeholder="Enter phone number"
        keyboardType="phone-pad"
        value={userDraft.phone}
        onChangeText={(v) => handleFieldChange('phone', v)}
      /> */}
      {/* Phone Number Input */}
      <PhoneNumberInput
        label="Phone Number"
        required
        
        value={userDraft.phone}
        onChangePhoneNumber={(value) => handleFieldChange('phone', value)}
        error={fieldErrors.phone}
      />
      {/* <ErrorMessage fieldName="phone" fieldErrors={fieldErrors} /> */}

      <DOBInput
        label="Enter Date of Birth"
        value={userDraft.dob ? new Date(userDraft.dob) : null}
        onChange={(date: Date) => handleDateChange('dob', date)}
      />
      <ErrorMessage fieldName="dob" fieldErrors={fieldErrors} />

      <Dropdown
        label="Gender"
        value={userDraft.gender || ''}
        onChange={(value: string) => handleFieldChange('gender', value)}
        options={GENDER_OPTIONS}
        placeholder="Select your gender"
      />
      <ErrorMessage fieldName="gender" fieldErrors={fieldErrors} />
      <Dropdown
        label="Preferred Language"
        value={userDraft.language || ''}
        onChange={(value: string) => handleFieldChange('language', value)}
        options={LANGUAGE_OPTIONS}
        placeholder="Select preferred language"
      />
      <ErrorMessage fieldName="language" fieldErrors={fieldErrors} />
      <View className="mb-2 mt-2">
        <Text className="mb-2 font-semibold text-gray-700">
          Health History <Text className="text-red-500">*</Text>
        </Text>
        <TextInput
          value={userDraft.healthHistory}
          onChangeText={(value: string) => handleFieldChange('healthHistory', value)}
          placeholder="Tell a brief story about your health history"
          placeholderTextColor="#999"
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          className="rounded-lg bg-[#F2F4F7] p-3 text-base text-gray-800"
          style={{ minHeight: 75, paddingVertical: 12 }}
        />
      </View>
      <ErrorMessage fieldName="healthHistory" fieldErrors={fieldErrors} />
      <View className="mt-8">
        <PrimaryButton
          title="Next"
          type="secondary"
          onPress={() => router.push('/(auth)/(user)/review')}
        />
      </View>
    </View>
  );
}
