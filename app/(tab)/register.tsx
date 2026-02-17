import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';

// ---------------- LabeledInput ----------------
type RInputProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  secureToggle?: boolean;
};

const RLabeledInput: React.FC<RInputProps> = ({ label, required, secureToggle, ...inputProps }) => {
  const [hidden, setHidden] = useState<boolean>(!!secureToggle);

  return (
    <View className="mb-5">
      <Text className="text-gray-700 text-sm mb-1.5">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      <View className="flex-row items-center bg-gray-200 rounded-xl h-12 px-3">
        <TextInput
          {...inputProps}
          secureTextEntry={secureToggle ? hidden : inputProps.secureTextEntry}
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-gray-900"
        />

        {secureToggle && (
          <Pressable onPress={() => setHidden((v) => !v)} className="px-1">
            <Text className="text-base">{hidden ? '👁' : '🙈'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

// ---------------- PrimaryButton ----------------
const RPrimaryButton = ({ title, onPress, loading }: { title: string; onPress?: () => void; loading?: boolean }) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="bg-[#0EA5A4] h-13 rounded-2xl items-center justify-center active:opacity-80"
    >
      <Text className="text-white font-semibold text-base">
        {loading ? 'Please wait…' : `${title}  →`}
      </Text>
    </Pressable>
  );
};

// ---------------- Register Screen ----------------
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const onRegister = () => {
    console.log({ name, email, password, confirm });
  };

  return (
    <View className="flex-1 bg-[#0EA5A4]">
      <View className="h-56" />

      <ScrollView className="flex-1 bg-gray-100 rounded-t-[36px] px-6 pt-7" contentContainerStyle={{ paddingBottom: 30 }}>
        <Text className="text-center text-[#0EA5A4] text-2xl font-bold mb-6">
          Create Account
        </Text>

        <RLabeledInput
          label="Full Name"
          required
          placeholder="John Doe"
          value={name}
          onChangeText={setName}
        />

        <RLabeledInput
          label="Email Address"
          required
          placeholder="xyz1@gmail.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <RLabeledInput
          label="Password"
          required
          placeholder="Password"
          secureToggle
          value={password}
          onChangeText={setPassword}
        />

        <RLabeledInput
          label="Confirm Password"
          required
          placeholder="Re-enter password"
          secureToggle
          value={confirm}
          onChangeText={setConfirm}
        />

        <View className="mt-3">
          <RPrimaryButton title="Register" onPress={onRegister} />
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-500">Already have an account? </Text>
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <Text className="text-[#0EA5A4] font-semibold">Login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
