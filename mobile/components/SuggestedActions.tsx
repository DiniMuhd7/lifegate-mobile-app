import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ConversationCategory } from 'types/chat-types';

export interface SuggestedAction {
  id: ConversationCategory;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  bg: string;
  border: string;
  prompt: string;
}

const ACTIONS: SuggestedAction[] = [
  {
    id: 'doctor_consultation',
    label: 'Doctor Consultation',
    icon: 'medical',
    iconColor: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
    prompt:
      'I need guidance on scheduling a doctor consultation. What should I discuss with the doctor and how should I prepare for my visit?',
  },
  {
    id: 'general_health',
    label: 'General Health',
    icon: 'heart',
    iconColor: '#0891b2',
    bg: '#f0f9ff',
    border: '#bae6fd',
    prompt:
      'I have general health questions. Can you help me with wellness advice, preventive care, and healthy lifestyle tips?',
  },
  {
    id: 'eye_checkup',
    label: 'Eye Check Up',
    icon: 'eye',
    iconColor: '#7c3aed',
    bg: '#faf5ff',
    border: '#ddd6fe',
    prompt:
      'I need information about an eye checkup. What should I know about maintaining good eye health and when should I see an ophthalmologist?',
  },
  {
    id: 'hearing_test',
    label: 'Hearing Test',
    icon: 'headset',
    iconColor: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    prompt:
      'I need guidance on hearing tests. How can I assess my hearing health and when should I see an audiologist?',
  },
  {
    id: 'mental_health',
    label: 'Mental Health',
    icon: 'happy',
    iconColor: '#be185d',
    bg: '#fdf2f8',
    border: '#fbcfe8',
    prompt:
      'I need support with my mental health and emotional wellbeing. Can you provide guidance on managing stress, anxiety, or mood?',
  },
];

interface SuggestedActionsProps {
  onSelect: (prompt: string, category: ConversationCategory) => void;
}

export const SuggestedActions: React.FC<SuggestedActionsProps> = ({ onSelect }) => {
  return (
    <View style={{ marginTop: 28 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: '#0f766e',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          textAlign: 'center',
          marginBottom: 14,
        }}
      >
        Quick Start
      </Text>

      {/* 2-column grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(action.prompt, action.id);
            }}
            activeOpacity={0.72}
            style={{
              width: '47%',
              backgroundColor: action.bg,
              borderColor: action.border,
              borderWidth: 1.5,
              borderRadius: 18,
              paddingVertical: 14,
              paddingHorizontal: 12,
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Icon circle */}
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: action.iconColor + '1a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={action.icon} size={22} color={action.iconColor} />
            </View>

            {/* Label */}
            <Text
              numberOfLines={2}
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: '#1e293b',
                textAlign: 'center',
                lineHeight: 17,
              }}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
