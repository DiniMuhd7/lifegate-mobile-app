import React from "react";
import { View } from "react-native";
import { PrimaryButton } from "components/Button";
import { LabeledInput } from "components/LabeledInput";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";

export default function UserAccountStep() {
  const { userDraft, setUserField } = useAuthStore();

  return (
    <View className="px-6">
      <LabeledInput
        label="Full Name"
        required
        placeholder="Enter your full name"
        value={userDraft.name}
        onChangeText={(v) => setUserField("name", v)}
      />
      <LabeledInput
        label="Email"
        required
        placeholder="Enter your email"
        value={userDraft.email}
        onChangeText={(v) => setUserField("email", v)}
      />
      <LabeledInput
        label="Password"
        required
        placeholder="Password"
        secureToggle
        value={userDraft.password}
        onChangeText={(v) => setUserField("password", v)}
      />
      <LabeledInput
        label="Confirm Password"
        required
        placeholder="Confirm Password"
        secureToggle
        value={userDraft.confirm}
        onChangeText={(v) => setUserField("confirm", v)}
      />

      <View className="mt-8">
        <PrimaryButton
          title="Next"
          onPress={() => router.push("/(auth)/(user)/profile")}
          type="secondary"
        />
      </View>
    </View>
  );
}
