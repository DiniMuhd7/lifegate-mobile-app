import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  required?: boolean;
  hasError?: boolean;
};

export const DOBInput = ({ label, value, onChange, required, hasError }: Props) => {
  const [show, setShow] = useState(false);

  const handleChange = (_: any, selectedDate?: Date) => {
    setShow(Platform.OS === 'ios'); // keep open on iOS (spinner mode), close on Android
    if (selectedDate) {
      onChange(selectedDate);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Select your date of birth';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <View className="mb-3">
      {/* Label — matches LabeledInput */}
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      {/* Trigger button — same height and shape as LabeledInput */}
      <Pressable
        onPress={() => setShow(true)}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        }`}>
        <Text className={`flex-1 ${ value ? 'text-gray-900' : 'text-gray-400' }`}>
          {formatDate(value)}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#0EA5A4" />
      </Pressable>

      {/* Date Picker */}
      {show && (
        <DateTimePicker
          value={value || new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={handleChange}
        />
      )}
    </View>
  );
};