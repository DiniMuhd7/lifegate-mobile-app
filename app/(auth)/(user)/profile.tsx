import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { useAuthStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { DOBInput } from 'components/DobPicker';
import { validateSingleField } from 'utils/validation';

export default function UserProfileStep() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    setUserField(fieldName as keyof typeof userDraft, value);
    const error = validateSingleField(fieldName, value, false);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, false);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
    console.log('New Date set:', new_date);
  };

  const renderErrorMessage = (fieldName: string) => {
    return fieldErrors[fieldName] ? (
      <Text className="text-red-500 text-xs mt-1">{fieldErrors[fieldName]}</Text>
    ) : null;
  };

  return (
    <View className="px-6">
      <LabeledInput
        label="Phone Number"
        required
        placeholder="Enter phone number"
        keyboardType="phone-pad"
        value={userDraft.phone}
        onChangeText={(v) => handleFieldChange('phone', v)}
      />
      {renderErrorMessage('phone')}

      <DOBInput
        label="Enter Date of Birth"
        value={userDraft.dob ? new Date(userDraft.dob) : null}
        onChange={(date: Date) => handleDateChange('dob', date)}
      />
      {renderErrorMessage('dob')}

      <Dropdown
        label="Gender"
        value={userDraft.gender || ''}
        onChange={(value: string) => handleFieldChange('gender', value)}
        options={GENDER_OPTIONS}
        placeholder="Select gender"
      />
      {renderErrorMessage('gender')}

      <LabeledInput
        label="Health History"
        required
        placeholder="Tell a brief story about your health history"
        onChangeText={(value: string) => handleFieldChange('healthHistory', value)}
      />
      {renderErrorMessage('healthHistory')}

      <Dropdown
        label="Preferred Language"
        value={userDraft.language || ''}
        onChange={(value: string) => handleFieldChange('language', value)}
        options={LANGUAGE_OPTIONS}
        placeholder="Select preferred language"
      />
      {renderErrorMessage('language')}

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
