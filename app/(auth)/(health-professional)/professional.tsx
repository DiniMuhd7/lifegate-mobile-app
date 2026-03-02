import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { PrimaryButton } from 'components/Button';
import { GENDER_OPTIONS, SPECIALTY_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { DOBInput } from 'components/DobPicker';
import { useState } from 'react';
import { validateSingleField } from 'utils/validation';

export default function ProfessionalScreen() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, true);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    const new_date = date.toISOString().split('T')[0];
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, true);
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
    <View className="flex-1 justify-start bg-white p-3">
      <LabeledInput
        label="Phone"
        required
        value={userDraft.phone}
        onChangeText={(v) => handleFieldChange('phone', v)}
      />
      {renderErrorMessage('phone')}

      <DOBInput
        label="Date of Birth"
        value={userDraft.dob ? new Date(userDraft.dob) : null}
        onChange={(date: Date) => handleDateChange('dob', date)}
      />
      {renderErrorMessage('dob')}

      <Dropdown
        label="Gender"
        required
        value={userDraft.gender}
        onChange={(v) => handleFieldChange('gender', v)}
        placeholder="Select Gender"
        options={GENDER_OPTIONS}
      />
      {renderErrorMessage('gender')}

      <Dropdown
        label='Preferred Language'
        value={userDraft.language || ''}
        onChange={(v) => handleFieldChange('language', v)}
        placeholder="Select Preferred Language"
        options={LANGUAGE_OPTIONS}
      />
      {renderErrorMessage('language')}

      <LabeledInput
        label="Years of Practice"
        required
        value={userDraft.yearsOfExperience || ''}
        placeholder="Years of Experience"
        keyboardType="numeric"
        onChangeText={(v) => handleFieldChange('yearsOfExperience', v)}
      />
      {renderErrorMessage('yearsOfExperience')}

      <Dropdown
        label="Specialization"
        required
        value={userDraft.specialization || ''}
        onChange={(v) => handleFieldChange('specialization', v)}
        placeholder="Select Specialization"
        options={SPECIALTY_OPTIONS}
      />
      {renderErrorMessage('specialization')}

      <PrimaryButton title="Next" onPress={() => router.push('/(auth)/(health-professional)/license')} type="secondary" disabled={!canProceed()} />
    </View>
  );
}
