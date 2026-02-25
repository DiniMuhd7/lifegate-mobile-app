import React from "react";
import { View } from "react-native";
import { PrimaryButton } from "components/Button";
import { LabeledInput } from "components/LabeledInput";
import { Dropdown } from "components/DropDown";
import { PrimaryCalendar } from "components/Calender";
import { GENDER_OPTIONS } from "constants/constants";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";

export default function UserProfileStep() {
  const { userDraft, setUserField } = useAuthStore();

  return (
    <View className="px-6">
      <PrimaryCalendar
        label="Date of Birth"
        value={userDraft.dob}
        onChange={(value: string) => setUserField("dob", value)}
      />

      <Dropdown
        label="Gender"
        value={userDraft.gender || ""}
        onChange={(value: string) => setUserField("gender", value)}
        options={GENDER_OPTIONS}
        placeholder="Select gender"
      />

      <LabeledInput
        label="Phone Number"
        required
        placeholder="Enter phone number"
        keyboardType="phone-pad"
        value={userDraft.phone}
        onChangeText={(v) => setUserField("phone", v)}
      />  

      <View className="mt-8">
        <PrimaryButton
          title="Next"
          type="secondary"
          onPress={() => router.push("/(auth)/(user)/review")}
        />
      </View>
    </View>
  );
}
