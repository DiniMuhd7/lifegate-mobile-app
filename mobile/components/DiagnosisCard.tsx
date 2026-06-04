import React from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
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
  /** Called when the patient taps a call button. Only rendered when diagnosisId is present. */
  onCallPress?: (callType: 'voice' | 'video') => void;
}

export const DiagnosisCard = React.memo<DiagnosisCardProps>(function DiagnosisCard({ diagnosis, diagnosisId, isExistingCase, onCallPress }) {
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

        {/* Description — rendered as plain-English bullet lines */}
        {diagnosis.description ? (
          <View style={{ gap: 4, marginTop: 2 }}>
            {diagnosis.description
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => {
                const isBullet = line.startsWith('•');
                const labelMatch = isBullet
                  ? line.slice(1).trim().match(/^([^:]+):(.*)$/)
                  : null;
                if (labelMatch) {
                  return (
                    <View key={i} style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-start' }}>
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: (isExistingCase ? '#0f766e' : config.color) + '1a',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '800', color: isExistingCase ? '#0f766e' : config.color }}>
                          {i + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, lineHeight: 16, color: '#374151' }}>
                          <Text style={{ fontWeight: '700', color: isExistingCase ? '#0f766e' : config.color }}>
                            {labelMatch[1].trim()}:{' '}
                          </Text>
                          <Text style={{ color: '#475569' }}>{labelMatch[2].trim()}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                }
                return (
                  <Text key={i} style={{ fontSize: 11.5, color: '#475569', lineHeight: 17 }}>
                    {line}
                  </Text>
                );
              })}
          </View>
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

        {/* ── Call-to-action: connect with physician ─────────────────────── */}
        {/* Show voice + video call buttons whenever a case has been saved    */}
        {/* (diagnosisId is present) and the urgency warrants a doctor visit. */}
        {diagnosisId && onCallPress && diagnosis.urgency !== 'LOW' && (
          <View
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: isExistingCase ? '#99f6e4' : config.border,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.7,
                marginBottom: 8,
              }}
            >
              Talk to your doctor now
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Voice call */}
              <TouchableOpacity
                onPress={() => onCallPress('voice')}
                activeOpacity={0.78}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#0f766e',
                  borderRadius: 10,
                  paddingVertical: 9,
                }}
              >
                <Ionicons name="call" size={15} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Voice Call</Text>
              </TouchableOpacity>

              {/* Video call */}
              <TouchableOpacity
                onPress={() => onCallPress('video')}
                activeOpacity={0.78}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#fff',
                  borderWidth: 1.5,
                  borderColor: '#0f766e',
                  borderRadius: 10,
                  paddingVertical: 9,
                }}
              >
                <Ionicons name="videocam" size={15} color="#0f766e" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f766e' }}>Video Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
});
