import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Diagnosis } from 'types/chat-types';

const URGENCY_CONFIG = {
  LOW: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    icon: 'checkmark-circle' as const,
    label: 'Low Risk',
  },
  MEDIUM: {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: 'warning' as const,
    label: 'Moderate',
  },
  HIGH: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    icon: 'alert-circle' as const,
    label: 'High Risk',
  },
  CRITICAL: {
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#ddd6fe',
    icon: 'pulse' as const,
    label: 'Critical',
  },
};

interface DiagnosisCardProps {
  diagnosis: Diagnosis;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ diagnosis }) => {
  const config =
    URGENCY_CONFIG[diagnosis.urgency as keyof typeof URGENCY_CONFIG] ||
    URGENCY_CONFIG.MEDIUM;

  return (
    <View
      style={{
        marginTop: 10,
        borderRadius: 14,
        padding: 12,
        backgroundColor: config.bg,
        borderWidth: 1.5,
        borderColor: config.border,
      }}
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: '#6b7280',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Possible Condition
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 20,
            backgroundColor: config.color + '22',
          }}
        >
          <Ionicons name={config.icon} size={11} color={config.color} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: config.color }}>
            {config.label}
          </Text>
        </View>
      </View>

      {/* Condition name */}
      <Text
        style={{ fontSize: 13.5, fontWeight: '700', color: '#1e293b', marginBottom: 4 }}
      >
        {diagnosis.condition}
      </Text>

      {/* Description */}
      {diagnosis.description ? (
        <Text style={{ fontSize: 11.5, color: '#475569', lineHeight: 17 }}>
          {diagnosis.description}
        </Text>
      ) : null}
    </View>
  );
};
