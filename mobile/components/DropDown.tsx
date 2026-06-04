import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
  selectedValue?: string;
  onChange?: (value: string) => void;
  triggerClassName?: string;
  menuClassName?: string;
}

export const Dropdown = ({
  label,
  options,
  placeholder = 'Select an option',
  required,
  hasError,
  selectedValue,
  onChange,
  triggerClassName = '',
}: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>('');

  // Sync selectedValue prop to internal state
  useEffect(() => {
    if (selectedValue !== undefined) {
      setValue(selectedValue);
    }
  }, [selectedValue]);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  const handleSelectOption = (optionValue: string) => {
    setValue(optionValue);
    setOpen(false);
    onChange?.(optionValue);
  };

  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      <Pressable
        onPress={() => setOpen(!open)}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        } ${triggerClassName}`}>
        <Text className={`flex-1 ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedLabel}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#0EA5A4" />
      </Pressable>

      {/* Inline expanding list — renders in-flow so ScrollView never clips it */}
      {open && (
        <View
          className="mt-1 overflow-hidden rounded-2xl border border-gray-100 bg-white"
          style={{
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
          }}>
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {options.map((option: DropdownOption, index: number) => (
              <Pressable
                key={option.value}
                onPress={() => handleSelectOption(option.value)}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  index < options.length - 1 ? 'border-b border-gray-50' : ''
                }`}>
                <Text
                  className={`text-base ${
                    option.value === value ? 'font-semibold text-[#0EA5A4]' : 'text-gray-800'
                  }`}>
                  {option.label}
                </Text>
                {option.value === value && (
                  <Ionicons name="checkmark-circle" size={18} color="#0EA5A4" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};