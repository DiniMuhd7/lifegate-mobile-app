import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { SessionMode } from 'types/chat-types';

interface ModeOption {
  id: SessionMode;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  bg: string;
  border: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    id: 'general_health',
    title: 'General Health',
    subtitle: 'AI-powered wellness guidance',
    badge: 'AI-Only',
    badgeColor: '#0891b2',
    badgeBg: '#e0f2fe',
    icon: 'heart-outline',
    iconColor: '#0891b2',
    bg: '#f0f9ff',
    border: '#bae6fd',
    description:
      'Get instant wellness tips, preventive care advice, and general health information. No physician review required.',
  },
  {
    id: 'clinical_diagnosis',
    title: 'Clinical Diagnosis',
    subtitle: 'AI triage + physician validation',
    badge: 'AI + Physician',
    badgeColor: '#0f766e',
    badgeBg: '#f0fdfa',
    icon: 'medical-outline',
    iconColor: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
    description:
      'Describe your symptoms for AI-powered triage. All diagnoses are reviewed and validated by a licensed physician.',
  },
];

interface ModeSelectionModalProps {
  visible: boolean;
  onSelect: (mode: SessionMode) => void;
}

export const ModeSelectionModal: React.FC<ModeSelectionModalProps> = ({
  visible,
  onSelect,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
        >
          <View style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 20 }}>
            {/* Drag handle */}
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: '#cbd5e1',
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: 22,
              }}
            />

            {/* Header */}
            <Text
              style={{
                fontSize: 21,
                fontWeight: '800',
                color: '#134e4a',
                textAlign: 'center',
                marginBottom: 4,
              }}
            >
              Choose Session Mode
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: '#64748b',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              Select the care pathway for this session
            </Text>

            {/* Mode cards */}
            {MODES.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSelect(mode.id);
                }}
                activeOpacity={0.75}
                style={{
                  backgroundColor: mode.bg,
                  borderColor: mode.border,
                  borderWidth: 1.5,
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                {/* Icon */}
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: 'white',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: mode.border,
                  }}
                >
                  <Ionicons name={mode.icon} size={24} color={mode.iconColor} />
                </View>

                {/* Text content */}
                <View style={{ flex: 1 }}>
                  {/* Title row + badge */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#134e4a',
                      }}
                    >
                      {mode.title}
                    </Text>
                    <View
                      style={{
                        backgroundColor: mode.badgeBg,
                        borderRadius: 6,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: mode.badgeColor,
                        }}
                      >
                        {mode.badge}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: '#475569',
                      lineHeight: 17,
                    }}
                  >
                    {mode.description}
                  </Text>
                </View>

                {/* Chevron */}
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={mode.iconColor}
                />
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};
