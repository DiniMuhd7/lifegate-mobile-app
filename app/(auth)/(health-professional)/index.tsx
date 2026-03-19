import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { LabeledInput } from "components/LabeledInput";
import { PrimaryButton } from "components/Button";
import { ErrorMessage } from "components/ErrorMessage";
import { useRegistrationStore } from "stores/auth-store";
import { useState } from "react";
import { validateSingleField } from "utils/validation";
import { Dropdown } from "components/DropDown";
import { DOBInput } from "components/DobPicker";
import { PhoneNumberInput } from "components/PhoneInput";
import { GENDER_OPTIONS, LANGUAGE_OPTIONS } from "constants/constants";

const VALID_FIELDS = {
  name: true,
  email: true,
  password: true,
  confirmPassword: true,
  phone: true,
  dob: true,
  gender: true,
  language: true,
  yearsOfExperience: true,
  specialization: true,
  certificateName: true,
  certificateId: true,
  licenseNumber: true,
  certificateIssueDate: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function AccountScreen() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    
    const additionalData = fieldName === 'confirmPassword' 
      ? { password: userDraft.password }
      : undefined;
    
    const error = validateSingleField(fieldName, value, true, additionalData);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error || ''
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
    // All required fields must be filled
    return (
      userDraft.name &&
      userDraft.email &&
      userDraft.password &&
      userDraft.confirmPassword &&
      userDraft.phone &&
      userDraft.dob &&
      userDraft.gender &&
      userDraft.language &&
      userDraft.yearsOfExperience &&
      userDraft.specialization &&
      userDraft.certificateName &&
      userDraft.certificateId &&
      userDraft.licenseNumber &&
      userDraft.certificateIssueDate &&
      // Check for no validation errors
      !fieldErrors.name &&
      !fieldErrors.email &&
      !fieldErrors.password &&
      !fieldErrors.confirmPassword &&
      !fieldErrors.phone &&
      !fieldErrors.dob &&
      !fieldErrors.gender &&
      !fieldErrors.language &&
      !fieldErrors.yearsOfExperience &&
      !fieldErrors.specialization &&
      !fieldErrors.certificateName &&
      !fieldErrors.certificateId &&
      !fieldErrors.licenseNumber &&
      !fieldErrors.certificateIssueDate
    );
  };



  return (
    <ScrollView className="flex-1 bg-white">
      <View className="flex-1 justify-start p-6">
        
        {/* ===== ACCOUNT INFORMATION ===== */}
        <Text className="mb-4 text-lg font-bold text-gray-900">Account Information</Text>

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
          placeholder="Enter your email address"
          type="email"
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

        {/* ===== PROFILE INFORMATION ===== */}
        <Text className="mb-4 mt-8 text-lg font-bold text-gray-900">Profile Information</Text>

        <PhoneNumberInput
          label="Phone Number"
          required
          value={userDraft.phone}
          onChangePhoneNumber={(value) => handleFieldChange('phone', value)}
          error={fieldErrors.phone}
        />

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
          onChangeText={(v) => handleFieldChange('yearsOfExperience', v)}
        />
        <ErrorMessage fieldName="yearsOfExperience" fieldErrors={fieldErrors} />

        <LabeledInput
          label="Medical Specialty"
          required
          value={userDraft.specialization || ''}
          placeholder="Type your medical specialty"
          onChangeText={(v) => handleFieldChange('specialization', v)}
        />
        <ErrorMessage fieldName="specialization" fieldErrors={fieldErrors} />

        {/* ===== LICENSE/CERTIFICATION INFORMATION ===== */}
        <Text className="mb-4 mt-8 text-lg font-bold text-gray-900">License Information</Text>

        <LabeledInput
          label="License Number"
          required
          placeholder="Enter your license number"
          value={userDraft.licenseNumber}
          onChangeText={(v) => handleFieldChange('licenseNumber', v)}
        />
        <ErrorMessage fieldName="licenseNumber" fieldErrors={fieldErrors} />

        <LabeledInput
          label="Certificate Name"
          required
          placeholder="Type certificate name"
          value={userDraft.certificateName}
          onChangeText={(v) => handleFieldChange('certificateName', v)}
        />
        <ErrorMessage fieldName="certificateName" fieldErrors={fieldErrors} />

        <LabeledInput
          label="Certificate ID"
          required
          placeholder="Type certificate ID"
          value={userDraft.certificateId}
          onChangeText={(v) => handleFieldChange('certificateId', v)}
        />
        <ErrorMessage fieldName="certificateId" fieldErrors={fieldErrors} />

        <DOBInput
          label="Certificate Issue Date"
          value={userDraft.certificateIssueDate ? new Date(userDraft.certificateIssueDate) : null}
          onChange={(date: Date) => handleDateChange('certificateIssueDate', date)}
        />
        <ErrorMessage fieldName="certificateIssueDate" fieldErrors={fieldErrors} />

        {/* ===== NEXT BUTTON - Navigate to Review ===== */}
        <PrimaryButton 
          title="Next ->"
          onPress={() => router.push('/(auth)/(health-professional)/professional')}
          type="secondary"
          disabled={!canProceed()}
        />
      </View>
    </ScrollView>
  );
}
