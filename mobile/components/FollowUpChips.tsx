/**
 * FollowUpChips
 *
 * Renders EDIS follow-up questions as horizontally scrollable tappable chips
 * below an AI message bubble. Tapping a chip sends it as the next user message.
 */
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  questions: string[];
  onSelect: (question: string) => void;
}

export const FollowUpChips: React.FC<Props> = ({ questions, onSelect }) => {
  if (!questions || questions.length === 0) return null;

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Ionicons name="help-circle-outline" size={12} color="#0f766e" />
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#0f766e', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Suggested responses
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        {questions.map((question, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(question);
            }}
            activeOpacity={0.75}
            style={{
              backgroundColor: '#f0fdfa',
              borderWidth: 1,
              borderColor: '#5eead4',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 7,
              maxWidth: 240,
            }}
          >
            <Text
              style={{ fontSize: 12.5, color: '#0f766e', fontWeight: '500', lineHeight: 17 }}
              numberOfLines={2}
            >
              {question}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
