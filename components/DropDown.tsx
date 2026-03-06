import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import {Ionicons} from '@expo/vector-icons'

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
}

export const Dropdown = ({ label, value, onChange, options, placeholder = 'Select an option' }: DropdownProps) => {
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  return (
    <View className="mb-5">
      <View className='flex-row max-w-50 justify-between'>
      <Text className="text-gray-600 mb-1 font-bold">{label} </Text>
      <Text className="text-red-500">*</Text>
        </View>  
      <Pressable
        onPress={() => setOpen(true)}
        className=" rounded-xl px-3 py-3 bg-[#F2F4F7]">
        <Text className={`${value ? 'text-black' : 'text-gray-400'}`}>{selectedLabel}</Text>
        <Ionicons name="chevron-down" size={16} color="#0EA5A4" className="absolute right-3 top-3" />
      </Pressable>

      <Modal transparent visible={open} animationType="fade">
        <Pressable className="flex-1 bg-black/30 justify-center px-6" onPress={() => setOpen(false)}>
          <View className="bg-white rounded-2xl p-4">
            {options.map((option: DropdownOption) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="py-3">
                <Text className="text-base">{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};
