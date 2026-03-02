import { View, Text } from "react-native";
import { router } from "expo-router";
import { LabeledInput } from "components/LabeledInput";
import { PrimaryButton } from "components/Button";
import { useAuthStore } from "stores/auth-store";
import { useState } from "react";
import { validateSingleField } from "utils/validation";

export default function AccountScreen() {
  const { userDraft, setUserField } = useAuthStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: string) => {
    setUserField(fieldName, value);
    
    const additionalData = fieldName === 'confirm' || fieldName === 'confirmPassword' 
      ? { password: userDraft.password }
      : undefined;
    
    const error = validateSingleField(fieldName, value, true, additionalData);
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
    <View className="flex-1 bg-white p-6 justify-start">
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
        placeholder="Enter your email address"
        type="email"
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

      <PrimaryButton 
        title="Next" 
        onPress={() => router.push("/(auth)/(health-professional)/professional")} 
        type="secondary"
        disabled={!canProceed()}
      />
    </View>
  );
}
