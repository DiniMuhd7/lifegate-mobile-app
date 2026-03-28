import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type InputProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  secureToggle?: boolean;
  hasError?: boolean;
  type?: 'default' | 'email' | 'password';
};

export const LabeledInput: React.FC<InputProps> = ({
  label,
  required,
  secureToggle,
  hasError,
  ...inputProps
}) => {
  const [hidden, setHidden] = useState<boolean>(!!secureToggle);

  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      <View
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'bg-red-50 border border-red-300' : 'bg-[#F2F4F7]'
        }`}>
        <TextInput
          {...inputProps}
          secureTextEntry={secureToggle ? hidden : inputProps.secureTextEntry}
          autoCapitalize='none'
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-gray-900"
        />

        {secureToggle && (
          <Pressable onPress={() => setHidden((v) => !v)} className="px-1">
            <Ionicons
              name={hidden ? 'eye' : 'eye-off'}
              size={20} // adjust size as needed
              color="#9CA3AF" // match your theme color
            />
          </Pressable>
        )}
      </View>
    </View>
  );
};
