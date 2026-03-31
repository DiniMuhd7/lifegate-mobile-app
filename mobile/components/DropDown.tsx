import { useState, useEffect } from 'react';
import { View, Text, Pressable, LayoutRectangle, ScrollView } from 'react-native';
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
  menuClassName = '',
}: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>('');
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

  // Sync selectedValue prop to internal state
  useEffect(() => {
    if (selectedValue !== undefined) {
      setValue(selectedValue);
    }
  }, [selectedValue]);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  const handleSelectOption = (selectedValue: string) => {
    setValue(selectedValue);
    setOpen(false);
    onChange?.(selectedValue); // optional callback to parent
  };

  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      <Pressable
        onPress={() => setOpen(!open)}
        onLayout={(e) => setTriggerLayout(e.nativeEvent.layout)}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        } ${triggerClassName}`}>
        <Text className={`flex-1 ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#0EA5A4" />
      </Pressable>

      {open && triggerLayout && (
        <>
          <Pressable
            className="absolute inset-0 z-40"
            onPress={() => setOpen(false)}
          />
          
          <View
            className={`absolute top-20 left-0 right-0 z-50 rounded-2xl bg-white shadow-lg ${menuClassName}`}
            style={{ marginHorizontal: 0 }}>
            <ScrollView style={{ maxHeight: 300 }}>
              {options.map((option: DropdownOption) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectOption(option.value)}
                  className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                  <Text
                    className={`text-base ${
                      option.value === value
                        ? 'font-semibold text-[#0EA5A4]'
                        : 'text-gray-800'
                    }`}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
};