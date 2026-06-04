import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  confidence: number;
  editable?: boolean;
}

function getColor(v: number): string {
  if (v >= 86) return '#22c55e'; // green
  if (v >= 71) return '#3b82f6'; // blue
  if (v >= 41) return '#f59e0b'; // amber
  return '#ef4444';              // red
}

function getLabel(v: number): string {
  if (v >= 86) return 'High confidence';
  if (v >= 71) return 'Moderate confidence';
  if (v >= 41) return 'Low confidence';
  return 'Very low confidence';
}

/**
 * Visual horizontal bar displaying the AI confidence score (0-100).
 * Color: red (<41) → amber (41-70) → blue (71-85) → green (86+)
 */
export function ConfidenceBar({ confidence }: Props) {
  const clamped = Math.min(100, Math.max(0, confidence));
  const color = getColor(clamped);
  const label = getLabel(clamped);

  return (
    <View>
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-xs text-gray-500">{label}</Text>
        <Text className="text-sm font-bold" style={{ color }}>
          {clamped}%
        </Text>
      </View>
      <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <View
          style={{
            width: `${clamped}%`,
            height: 8,
            backgroundColor: color,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}
