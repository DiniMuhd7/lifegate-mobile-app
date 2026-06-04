import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  password: string;
}

function getScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  return score;
}

const LEVELS = [
  { label: 'Weak', color: '#EF4444' },
  { label: 'Weak', color: '#EF4444' },
  { label: 'Fair', color: '#F97316' },
  { label: 'Good', color: '#EAB308' },
  { label: 'Strong', color: '#22C55E' },
];

export function PasswordStrengthBar({ password }: Props) {
  if (!password) return null;

  const score = getScore(password);
  const { label, color } = LEVELS[score];

  return (
    <View className="mb-3 mt-1">
      <View className="flex-row gap-1">
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: i <= score ? color : '#E5E7EB' }}
          />
        ))}
      </View>
      <Text className="mt-1 text-xs font-medium" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
