import React, { useState } from "react";
import { View, Alert, Text } from "react-native";
import { PrimaryButton } from "components/Button";
import { LabeledInput } from "components/LabeledInput";
import { ErrorMessage } from "components/ErrorMessage";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";
import { validateSingleField } from "utils/validation";

const VALID_FIELDS = {
  name: true,
  email: true,
  password: true,
  confirmPassword: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function UserAccountStep() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    
    const additionalData = fieldName === 'confirmPassword' 
      ? { password: userDraft.password }
      : undefined;
    
    const error = validateSingleField(fieldName, value, false, additionalData);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
  };

  const canProceed = () => {
    return (
      userDraft.name &&
      userDraft.email &&
      userDraft.password &&
      userDraft.confirmPassword &&
      !fieldErrors.name &&
      !fieldErrors.email &&
      !fieldErrors.password &&
      !fieldErrors.confirmPassword &&
      !fieldErrors.confirm
    );
  };

  return (
    <View className="px-6">
      <LabeledInput
        label="Full Name"
        required
        placeholder="Enter your full name"
        value={userDraft.name}
        onChangeText={(v) => handleFieldChange("name", v)}
      />
      <ErrorMessage fieldName="name" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Email"
        required
        placeholder="Enter your email"
        value={userDraft.email}
        onChangeText={(v) => handleFieldChange("email", v)}
      />
      <ErrorMessage fieldName="email" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Password"
        required
        placeholder="Password"
        secureToggle
        value={userDraft.password}
        onChangeText={(v) => handleFieldChange("password", v)}
      />
      <ErrorMessage fieldName="password" fieldErrors={fieldErrors} />

      <LabeledInput
        label="Confirm Password"
        required
        placeholder="Confirm Password"
        secureToggle
        value={userDraft.confirmPassword}
        onChangeText={(v) => handleFieldChange("confirmPassword", v)}
      />
      <ErrorMessage fieldName="confirmPassword" fieldErrors={fieldErrors} />

      <View className="mt-8">
        <PrimaryButton
          title="Next"
          onPress={() => router.push("/(auth)/(user)/profile")}
          type="secondary"
          disabled={!canProceed()}
        />
      </View>
    </View>
  );
}
