import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/LabeledInput';
import { ErrorMessage } from 'components/ErrorMessage';
import { PasswordStrengthBar } from 'components/PasswordStrength';
import { Dropdown } from 'components/DropDown';
import { useRegistrationStore } from 'stores/auth-store';
import { router } from 'expo-router';
import { validateNewPasswordMatch, validateSingleField } from 'utils/validation';
import { ACADEMIC_LEVEL_OPTIONS, DEPARTMENT_OPTIONS, FACULTY_OPTIONS, OCCUPATION_STATUS_OPTIONS } from 'constants/constants';
import { SuggestInput } from 'components/SuggestInput';

const STEP_FIELDS = ['name', 'email', 'password', 'confirmPassword', 'occupationStatus'] as const;
type StepField = (typeof STEP_FIELDS)[number];

export default function UserAccountStep() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (field: StepField, value: string) => {
    setUserField(field, value);

    let error: string | null = null;
    if (field === 'password') {
      error = validateSingleField(field, value, false);
      // Revalidate confirm password when password changes
      if (userDraft.confirmPassword) {
        const confirmErr = validateNewPasswordMatch(userDraft.confirmPassword, value);
        setFieldErrors((prev) => ({ ...prev, confirmPassword: confirmErr || '' }));
      }
    } else if (field === 'confirmPassword') {
      error = validateNewPasswordMatch(value, userDraft.password);
    } else {
      error = validateSingleField(field, value, false);
    }

    setFieldErrors((prev) => ({ ...prev, [field]: error || '' }));
  };

  const canProceed = (): boolean => {
    const requiredFieldsComplete = STEP_FIELDS.every((field) => {
      const value = userDraft[field];
      return value && value.trim() !== '' && !fieldErrors[field];
    });

    if (!requiredFieldsComplete) return false;

    if (userDraft.occupationStatus === 'Student') {
      return Boolean(
        userDraft.department?.trim() && userDraft.faculty?.trim() && userDraft.academicLevel?.trim()
      );
    }

    return true;
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
        <Text className="mb-4 text-lg font-bold text-gray-900">Account Information</Text>

        <LabeledInput
          label="Full Name"
          required
          placeholder="Enter your full name"
          value={userDraft.name}
          hasError={!!fieldErrors.name}
          onChangeText={(v) => handleFieldChange('name', v)}
        />
        <ErrorMessage fieldName="name" fieldErrors={fieldErrors} />

        <LabeledInput
          label="Email Address"
          required
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={userDraft.email}
          hasError={!!fieldErrors.email}
          onChangeText={(v) => handleFieldChange('email', v)}
        />
        <ErrorMessage fieldName="email" fieldErrors={fieldErrors} />

        <Dropdown
          label="Occupation Status"
          required
          selectedValue={userDraft.occupationStatus || ''}
          onChange={(value: string) => {
            setUserField('occupationStatus', value);
            if (value !== 'Student') {
              setUserField('department', '');
              setUserField('faculty', '');
              setUserField('academicLevel', '');
            }
          }}
          options={OCCUPATION_STATUS_OPTIONS}
          placeholder="Select occupation status"
        />

        {userDraft.occupationStatus === 'Student' && (
          <>
            <Text style={{ marginBottom: 6, fontWeight: '500', color: '#374151', fontSize: 14 }}>Department *</Text>
            <SuggestInput
              value={userDraft.department || ''}
              onChangeText={(v) => setUserField('department', v)}
              suggestions={DEPARTMENT_OPTIONS}
              placeholder="Search or enter your department"
              placeholderTextColor="#9CA3AF"
              inputClassName="rounded-xl p-3 text-sm text-gray-800 h-12 bg-[#F2F4F7]"
            />

            <Text style={{ marginBottom: 6, fontWeight: '500', color: '#374151', fontSize: 14 }}>Faculty *</Text>
            <SuggestInput
              value={userDraft.faculty || ''}
              onChangeText={(v) => setUserField('faculty', v)}
              suggestions={FACULTY_OPTIONS}
              placeholder="Search or enter your faculty"
              placeholderTextColor="#9CA3AF"
              inputClassName="rounded-xl p-3 text-sm text-gray-800 h-12 bg-[#F2F4F7]"
            />

            <Text style={{ marginBottom: 6, fontWeight: '500', color: '#374151', fontSize: 14 }}>Level *</Text>
            <SuggestInput
              value={userDraft.academicLevel || ''}
              onChangeText={(v) => setUserField('academicLevel', v)}
              suggestions={ACADEMIC_LEVEL_OPTIONS}
              placeholder="Search or enter your level"
              placeholderTextColor="#9CA3AF"
              inputClassName="rounded-xl p-3 text-sm text-gray-800 h-12 bg-[#F2F4F7]"
            />
          </>
        )}

        <LabeledInput
          label="Password"
          required
          placeholder="Min. 8 characters, uppercase & number"
          secureToggle
          value={userDraft.password}
          hasError={!!fieldErrors.password}
          onChangeText={(v) => handleFieldChange('password', v)}
        />
        <ErrorMessage fieldName="password" fieldErrors={fieldErrors} />
        <PasswordStrengthBar password={userDraft.password} />

        <LabeledInput
          label="Confirm Password"
          required
          placeholder="Re-enter your password"
          secureToggle
          value={userDraft.confirmPassword}
          hasError={!!fieldErrors.confirmPassword}
          onChangeText={(v) => handleFieldChange('confirmPassword', v)}
        />
        <ErrorMessage fieldName="confirmPassword" fieldErrors={fieldErrors} />

        <View className="mb-4 mt-6">
          <PrimaryButton
            title="Continue"
            onPress={() => router.push('/(auth)/(user)/profile')}
            disabled={!canProceed()}
          />
        </View>
      </View>
    </ScrollView>
  );
}
