import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
};

export const DOBInput = ({ label, value, onChange }: Props) => {
  // Controls whether the picker modal is open
  const [show, setShow] = useState(false);

  // Runs when user selects a date
  const handleChange = (_: any, selectedDate?: Date) => {
    setShow(false); // close picker
    if (selectedDate) {
      onChange(selectedDate); // send date to parent (Register screen)
    }
  };

  // Converts date into readable format
  const formatDate = (date: Date | null) => {
    if (!date) return 'Select your date of birth';

    return date.toDateString();
  };

  return (
    <View className="mb-5">
      {/* Label */}
      <Text className="mb-1 font-medium text-gray-600">
        {label} <Text className="text-red-500">*</Text>
      </Text>
      <Pressable
        onPress={() => setShow(true)}
        className="rounded-xl border border-gray-300 bg-white px-4 py-4">
        <Text className="text-gray-800">{formatDate(value)}</Text>
      </Pressable>
      {/* Date Picker Modal */}
      {show && (
        <DateTimePicker
          value={value || new Date(2000, 0, 1)} // default year to avoid 2026 showing
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()} // prevents future date
          onChange={handleChange}
        />
      )}
      <Ionicons name="calendar" size={16} color="#0EA5A4" className="absolute bottom-3 right-3" />
    </View>
  );
};
