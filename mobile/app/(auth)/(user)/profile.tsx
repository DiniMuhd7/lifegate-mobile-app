import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from 'constants/constants';
import { NIGERIA_STATES, PHONE_CODES, COUNTRIES } from 'constants/geo';
import { useRegistrationStore } from 'stores/auth-store';
import { router, useFocusEffect } from 'expo-router';
import { DOBInput } from 'components/DobPicker';
import { validateSingleField } from 'utils/validation';
import { SearchableDropdown } from 'components/SearchableDropdown';
import { SuggestInput } from 'components/SuggestInput';

const VALID_FIELDS = {
  phone: true,
  dob: true,
  gender: true,
  language: true,
  referredByCode: true,
  state: true,
  country: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function UserProfileStep() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialCode, setDialCode] = useState('+234');
  const [phoneNum, setPhoneNum] = useState('');

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

  const updatePhone = (code: string, num: string) => {
    const digits = num.replace(/\D/g, '');
    const full = digits ? code + digits : '';
    handleFieldChange('phone', full);
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
        <SearchableDropdown
          label="Phone Country Code"
          required
          options={PHONE_CODES}
          selectedValue={dialCode}
          onChange={(code) => {
            setDialCode(code);
            updatePhone(code, phoneNum);
          }}
          searchPlaceholder="Search country or code…"
          hasError={!!fieldErrors.phone}
        />

        <LabeledInput
          label="Phone Number"
          required
          placeholder="Enter phone number"
          keyboardType="phone-pad"
          value={phoneNum}
          hasError={!!fieldErrors.phone}
          onChangeText={(v) => {
            setPhoneNum(v);
            updatePhone(dialCode, v);
          }}
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

        <SearchableDropdown
          label="Country"
          options={COUNTRIES.map((c) => ({ label: c, value: c }))}
          selectedValue={userDraft.country || ''}
          onChange={(v) => handleFieldChange('country', v)}
          hasError={!!fieldErrors.country}
          searchPlaceholder="Search country…"
        />
        <ErrorMessage fieldName="country" fieldErrors={fieldErrors} />

        <View className="mb-3">
          <Text className="mb-1.5 font-medium text-gray-700">State / Province</Text>
          <SuggestInput
            value={userDraft.state || ''}
            onChangeText={(v) => handleFieldChange('state', v)}
            suggestions={userDraft.country === 'Nigeria' ? NIGERIA_STATES : []}
            placeholder={userDraft.country === 'Nigeria' ? 'Search state…' : 'Enter your state or province'}
            placeholderTextColor="#9CA3AF"
            inputClassName={`rounded-xl p-3 text-sm text-gray-800 h-12 ${
              fieldErrors.state ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
            }`}
          />
        </View>
        <ErrorMessage fieldName="state" fieldErrors={fieldErrors} />

        <View className="mb-2 mt-1">
          <Text className="mb-1.5 font-medium text-gray-700">
            Referral Code{' '}
            <Text className="text-xs font-normal text-gray-400">(optional)</Text>
          </Text>
          <TextInput
            value={userDraft.referredByCode || ''}
            onChangeText={(value: string) => setUserField('referredByCode', value.trim().toUpperCase())}
            placeholder="Enter referral code"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            className="rounded-xl p-3 text-sm text-gray-800 bg-[#F2F4F7]"
          />
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
