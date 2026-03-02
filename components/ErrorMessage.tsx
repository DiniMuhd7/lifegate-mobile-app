import React from 'react';
import { Text } from 'react-native';

interface ErrorMessageProps {
  fieldName: string;
  fieldErrors: Record<string, string>;
}

export function ErrorMessage({ fieldName, fieldErrors }: ErrorMessageProps) {
  return fieldErrors[fieldName] ? (
    <Text className="text-red-500 text-xs mt-1">{fieldErrors[fieldName]}</Text>
  ) : null;
}
