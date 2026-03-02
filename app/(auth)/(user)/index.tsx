import React, { useState } from "react";
import { View, Alert, Text } from "react-native";
import { PrimaryButton } from "components/Button";
import { LabeledInput } from "components/LabeledInput";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";
import { validateSingleField } from "utils/validation";

export default function UserAccountStep() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    setUserField(fieldName, value);
    
    const additionalData = fieldName === 'confirm' || fieldName === 'confirmPassword' 
      ? { password: userDraft.password }
      : undefined;
    
    const error = validateSingleField(fieldName, value, false, additionalData);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
    }));
  };

  const renderErrorMessage = (fieldName: string) => {
    return fieldErrors[fieldName] ? (
      <Text className="text-red-500 text-xs mt-1">{fieldErrors[fieldName]}</Text>
    ) : null;
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
      {renderErrorMessage("name")}

      <LabeledInput
        label="Email"
        required
        placeholder="Enter your email"
        value={userDraft.email}
        onChangeText={(v) => handleFieldChange("email", v)}
      />
      {renderErrorMessage("email")}

      <LabeledInput
        label="Password"
        required
        placeholder="Password"
        secureToggle
        value={userDraft.password}
        onChangeText={(v) => handleFieldChange("password", v)}
      />
      {renderErrorMessage("password")}

      <LabeledInput
        label="Confirm Password"
        required
        placeholder="Confirm Password"
        secureToggle
        value={userDraft.confirmPassword}
        onChangeText={(v) => handleFieldChange("confirmPassword", v)}
      />
      {renderErrorMessage("confirmPassword") || renderErrorMessage("confirm")}

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
