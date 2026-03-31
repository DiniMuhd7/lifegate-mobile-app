import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { useRegistrationStore } from 'stores/auth-store';
import { router, useFocusEffect } from 'expo-router';
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
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      if (!userDraft.name || !userDraft.email || !userDraft.password) {
        router.replace('/(auth)/(user)');
      }
    }, [userDraft.name, userDraft.email, userDraft.password])
  );

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, false);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: error || '' }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    // Format as YYYY-MM-DD using local date getters to avoid UTC timezone offset
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const new_date = `${year}-${month}-${day}`;
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, false);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: error || '' }));
  };

  const canProceed = () =>
    !!userDraft.phone && !!userDraft.dob && !!userDraft.gender &&
    !fieldErrors.phone && !fieldErrors.dob && !fieldErrors.gender;

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
        <PhoneNumberInput
          label="Phone Number"
          required
          value={userDraft.phone}
          onChangePhoneNumber={(value) => handleFieldChange('phone', value)}
          error={fieldErrors.phone}
        />
        <ErrorMessage fieldName="phone" fieldErrors={fieldErrors} />

        <DOBInput
          label="Date of Birth"
          required
          hasError={!!fieldErrors.dob}
          value={userDraft.dob ? (() => { const [y, m, d] = userDraft.dob.split('-').map(Number); return new Date(y, m - 1, d); })() : null}
          onChange={(date: Date) => handleDateChange('dob', date)}
        />
        <ErrorMessage fieldName="dob" fieldErrors={fieldErrors} />

        <Dropdown
          label="Gender"
          required
          hasError={!!fieldErrors.gender}
          selectedValue={userDraft.gender || ''}
          onChange={(value: string) => handleFieldChange('gender', value)}
          options={GENDER_OPTIONS}
          placeholder="Select your gender"
        />
        <ErrorMessage fieldName="gender" fieldErrors={fieldErrors} />

        <Dropdown
          label="Preferred Language"
          selectedValue={userDraft.language || ''}
          onChange={(value: string) => handleFieldChange('language', value)}
          options={LANGUAGE_OPTIONS}
          placeholder="Select preferred language"
        />
        <ErrorMessage fieldName="language" fieldErrors={fieldErrors} />

        <View className="mb-2 mt-1">
          <Text className="mb-1.5 font-medium text-gray-700">
            Health History{' '}
            <Text className="text-xs font-normal text-gray-400">(optional)</Text>
          </Text>
          <TextInput
            value={userDraft.healthHistory}
            onChangeText={(value: string) => handleFieldChange('healthHistory', value)}
            placeholder="Briefly describe your medical history, conditions, or allergies"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            className={`rounded-xl p-3 text-sm text-gray-800 ${
              fieldErrors.healthHistory
                ? 'border border-red-300 bg-red-50'
                : 'bg-[#F2F4F7]'
            }`}
            style={{ minHeight: 100, paddingVertical: 12 }}
          />
          <ErrorMessage fieldName="healthHistory" fieldErrors={fieldErrors} />
        </View>

        <View className="mt-6 mb-4">
          <PrimaryButton
            title="Continue"
            onPress={() => router.push('/(auth)/(user)/review')}
            disabled={!canProceed()}
          />
        </View>
      </View>
    </ScrollView>
  );
}
