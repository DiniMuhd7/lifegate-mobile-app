import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { ErrorMessage } from 'components/ErrorMessage';
import { useRegistrationStore } from 'stores/auth-store';
import { useState } from 'react';
import { validateSingleField, validateNewPasswordMatch } from 'utils/validation';

const STEP_FIELDS = ['name', 'email', 'password', 'confirmPassword'] as const;
type StepField = (typeof STEP_FIELDS)[number];

export default function AccountScreen() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (field: StepField, value: string) => {
    setUserField(field, value);

    let error: string | null = null;
    if (field === 'password') {
      error = validateSingleField(field, value, false);
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

  const canProceed = () =>
    STEP_FIELDS.every((f) => {
      const v = userDraft[f];
      return v && v.trim() !== '' && !fieldErrors[f];
    });

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
          label="Email"
          required
          placeholder="Enter your email address"
          autoCapitalize="none"
          keyboardType="email-address"
          value={userDraft.email}
          hasError={!!fieldErrors.email}
          onChangeText={(v) => handleFieldChange('email', v)}
        />
        <ErrorMessage fieldName="email" fieldErrors={fieldErrors} />

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

        <View className="mt-6 mb-4">
          <PrimaryButton
            title="Continue"
            onPress={() => router.push('/(auth)/(health-professional)/professional')}
            disabled={!canProceed()}
          />
        </View>
      </View>
    </ScrollView>
  );
}
