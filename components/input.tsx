import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

type InputProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  secureToggle?: boolean;
};

export const LabeledInput: React.FC<InputProps> = ({ label, required, secureToggle, ...inputProps }) => {
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