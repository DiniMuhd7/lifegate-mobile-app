/**
 * DobPicker.web.tsx
 * Web-only platform-specific implementation of the DOB picker.
 * Metro/Expo automatically resolves this file instead of DobPicker.tsx on web.
 *
 * Strategy: overlay a transparent native HTML <input type="date"> over the
 * styled trigger button so the browser's built-in date picker opens on click.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  required?: boolean;
  hasError?: boolean;
};

export const DOBInput = ({ label, value, onChange, required, hasError }: Props) => {
  const formatDisplay = (date: Date | null): string => {
    if (!date) return 'Select your date of birth';
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Format date for the HTML input value attribute (must be YYYY-MM-DD)
  const toInputValue = (date: Date | null): string => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Today as YYYY-MM-DD for the max attribute (no future dates)
  const today = new Date();
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "YYYY-MM-DD"
    if (!val) return;
    // Parse as local date (split avoids UTC midnight offset bug)
    const [year, month, day] = val.split('-').map(Number);
    onChange(new Date(year, month - 1, day));
  };

  return (
    <View className="mb-3">
      {/* Label — matches LabeledInput */}
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      {/* Trigger — same height/shape as LabeledInput */}
      <View
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        }`}
        style={{ position: 'relative' }}>
        <Text className={`flex-1 ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {formatDisplay(value)}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#0EA5A4" />

        {/* Transparent HTML date input covers the full button area.
            Clicking anywhere on the button opens the browser's native date picker. */}
        {React.createElement('input', {
          type: 'date',
          value: toInputValue(value),
          max: maxDate,
          onChange: handleChange,
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            fontSize: 16, // prevents iOS Safari from zooming
          },
        })}
      </View>
    </View>
  );
};
