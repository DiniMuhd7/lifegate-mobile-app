import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  diagnosisId?: string;
  isExistingCase?: boolean;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ diagnosis, diagnosisId, isExistingCase }) => {
  if (!diagnosis?.condition?.trim()) return null;

  const config =
    URGENCY_CONFIG[diagnosis.urgency as keyof typeof URGENCY_CONFIG] ||
    URGENCY_CONFIG.MEDIUM;

  const handlePress = () => {
    if (diagnosisId) {
      router.push(`/(tab)/diagnosis/${diagnosisId}` as never);
    }
  };

  return (
    <Pressable
      onPress={diagnosisId ? handlePress : undefined}
      style={({ pressed }) => [{ opacity: pressed && diagnosisId ? 0.85 : 1 }]}
    >
      <View
        style={{
          marginTop: 10,
          borderRadius: 14,
          padding: 12,
          backgroundColor: isExistingCase ? '#f0fdfa' : config.bg,
          borderWidth: 1.5,
          borderColor: isExistingCase ? '#5eead4' : config.border,
        }}
      >
        {/* Existing-case continuation banner */}
        {isExistingCase && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: '#0f766e',
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 5,
              marginBottom: 10,
              alignSelf: 'flex-start',
            }}
          >
            <Ionicons name="refresh-circle" size={13} color="#ffffff" />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#ffffff', letterSpacing: 0.4 }}>
              Continuing existing case
            </Text>
          </View>
        )}

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
              color: isExistingCase ? '#0f766e' : '#6b7280',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {isExistingCase ? 'Active Case' : 'Possible Condition'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 20,
              backgroundColor: (isExistingCase ? '#0f766e' : config.color) + '22',
            }}
          >
            <Ionicons
              name={isExistingCase ? 'medkit' : config.icon}
              size={11}
              color={isExistingCase ? '#0f766e' : config.color}
            />
            <Text style={{ fontSize: 10, fontWeight: '700', color: isExistingCase ? '#0f766e' : config.color }}>
              {isExistingCase ? 'In Progress' : config.label}
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

        {/* Confidence score */}
        {diagnosis.confidence != null && diagnosis.confidence > 0 ? (
          <Text style={{ fontSize: 10.5, color: isExistingCase ? '#0f766e' : config.color, fontWeight: '600', marginTop: 6 }}>
            {diagnosis.confidence}% confidence
          </Text>
        ) : null}

        {/* View report / resume case link */}
        {diagnosisId ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: '#0AADA2', fontWeight: '600' }}>
              {isExistingCase ? 'View case & report' : 'View full report'}
            </Text>
            <Ionicons name="chevron-forward" size={12} color="#0AADA2" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};
