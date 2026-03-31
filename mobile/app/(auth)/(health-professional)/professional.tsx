import { View, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useRegistrationStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { PrimaryButton } from 'components/Button';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { DOBInput } from 'components/DobPicker';
import { PhoneNumberInput } from 'components/PhoneInput';
import { useState, useCallback } from 'react';
import { validateSingleField } from 'utils/validation';

const VALID_FIELDS = {
  phone: true,
  dob: true,
  gender: true,
  language: true,
  yearsOfExperience: true,
  specialization: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function ProfessionalScreen() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      if (!userDraft.name || !userDraft.email || !userDraft.password) {
        router.replace('/(auth)/(health-professional)');
      }
    }, [userDraft.name, userDraft.email, userDraft.password])
  );

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, true);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    // Format as YYYY-MM-DD using local date getters to avoid UTC timezone offset
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const new_date = `${year}-${month}-${day}`;
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, true);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

  const canProceed = () => {
    return (
      !!userDraft.phone &&
      !!userDraft.dob &&
      !!userDraft.gender &&
      !!userDraft.specialization &&
      !fieldErrors.phone &&
      !fieldErrors.dob &&
      !fieldErrors.gender &&
      !fieldErrors.specialization &&
      !fieldErrors.language &&
      !fieldErrors.yearsOfExperience
    );
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
      <PhoneNumberInput
        label="Phone Number"
        required
        value={userDraft.phone}
        onChangePhoneNumber={(v) => handleFieldChange('phone', v)}
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
        selectedValue={userDraft.gender}
        onChange={(v) => handleFieldChange('gender', v)}
        placeholder="Select your gender"
        options={GENDER_OPTIONS}
      />
      <ErrorMessage fieldName="gender" fieldErrors={fieldErrors} />

      <Dropdown
        label="Preferred Language"
        selectedValue={userDraft.language || ''}
        onChange={(v) => handleFieldChange('language', v)}
        placeholder="Select Preferred Language"
        options={LANGUAGE_OPTIONS}
      />
      <ErrorMessage fieldName="language" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Years of Practice"
        required
        value={userDraft.yearsOfExperience || ''}
        placeholder="Enter years of medical practice"
        keyboardType="numeric"
        hasError={!!fieldErrors.yearsOfExperience}
        onChangeText={(v) => handleFieldChange('yearsOfExperience', v)}
      />
      <ErrorMessage fieldName="yearsOfExperience" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Medical Specialty"
        required
        value={userDraft.specialization || ''}
        placeholder="Type your medical specialty"
        hasError={!!fieldErrors.specialization}
        onChangeText={(v) => handleFieldChange('specialization', v)}
      />
      <ErrorMessage fieldName="specialization" fieldErrors={fieldErrors} />

      <View className="mt-6 mb-4">
        <PrimaryButton
          title="Continue"
          onPress={() => router.push('/(auth)/(health-professional)/license')}
          disabled={!canProceed()}
        />
      </View>
      </View>
    </ScrollView>
  );
}
