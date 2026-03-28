import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useRegistrationStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { PrimaryButton } from 'components/Button';
import { GENDER_OPTIONS,  LANGUAGE_OPTIONS } from 'constants/constants';
import { DOBInput } from 'components/DobPicker';
import { PhoneNumberInput } from 'components/PhoneInput';
import { useState } from 'react';
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
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, true);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: error || '',
    }));
  };

  const canProceed = () => {
    return (
      userDraft.phone &&
      userDraft.gender &&
      userDraft.specialization &&
      !fieldErrors.phone &&
      !fieldErrors.gender &&
      !fieldErrors.specialization &&
      !fieldErrors.dob &&
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
      />
      <ErrorMessage fieldName="phone" fieldErrors={fieldErrors} />

      <DOBInput
        label="Date of Birth"
        value={userDraft.dob ? new Date(userDraft.dob) : null}
        onChange={(date: Date) => handleDateChange('dob', date)}
      />
      <ErrorMessage fieldName="dob" fieldErrors={fieldErrors} />

      <Dropdown
        label="Gender"
        value={userDraft.gender}
        onChange={(v) => handleFieldChange('gender', v)}
        placeholder="Select your gender"
        options={GENDER_OPTIONS}
      />
      <ErrorMessage fieldName="gender" fieldErrors={fieldErrors} />

      <Dropdown
        label="Preferred Language"
        value={userDraft.language || ''}
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
