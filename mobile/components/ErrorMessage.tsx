import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorMessageProps {
  fieldName: string;
  fieldErrors: Record<string, string>;
}

export function ErrorMessage({ fieldName, fieldErrors }: ErrorMessageProps) {
  if (!fieldErrors[fieldName]) return null;
  return (
    <View className="flex-row items-center mt-1 mb-2">
      <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
      <Text className="text-red-500 text-xs ml-1 flex-1">{fieldErrors[fieldName]}</Text>
    </View>
  );
}
