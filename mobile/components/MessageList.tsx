import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageBubble } from './MessageBubble';
import { UI_SPACING } from 'constants/constants';
import type { Diagnosis, Prescription, ConditionScore, RiskFlag, Investigation } from 'types/chat-types';

export interface Message {
  id: string;
  text: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  diagnosisId?: string;
  // Raw timestamp (ms) for grouping by date
  rawTimestamp?: number;
  // EDIS-specific fields
  followUpQuestions?: string[];
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
  investigations?: Investigation[];
}

interface MessageListProps {
  messages: Message[];
  onRetry?: (messageId: string) => void;
  onFollowUp?: (question: string) => void;
}

const formatDividerDate = (ts: number): string => {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

export const MessageList: React.FC<MessageListProps> = ({ messages, onRetry, onFollowUp }) => {
  const scrollRef = useRef<ScrollView>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to bottom whenever a new message is appended,
  // but only when the user is already near the bottom (preserves scroll when reading history).
  useEffect(() => {
    if (isAtBottomRef.current) {
      // Small delay so the layout has settled before scrolling.
      const t = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const atBottom = distanceFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollFab(distanceFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Build list items with date dividers injected
  const listItems: Array<{ type: 'message'; msg: Message } | { type: 'divider'; label: string }> = [];
  let lastDateStr = '';
  messages.forEach((msg) => {
    const ts = msg.rawTimestamp ?? Date.now();
    const dateStr = new Date(ts).toDateString();
    if (dateStr !== lastDateStr) {
      listItems.push({ type: 'divider', label: formatDividerDate(ts) });
      lastDateStr = dateStr;
    }
    listItems.push({ type: 'message', msg });
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerClassName={UI_SPACING.MESSAGE_LIST_PADDING_VERTICAL}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) {
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {listItems.map((item, index) => {
          if (item.type === 'divider') {
            return (
              <View
                key={`divider-${index}`}
                style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 16 }}
              >
                <View style={{ flex: 1, height: 1, backgroundColor: '#ccede9' }} />
                <Text
                  style={{
                    fontSize: 11,
                    color: '#0f766e',
                    fontWeight: '600',
                    marginHorizontal: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                  }}
                >
                  {item.label}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#ccede9' }} />
              </View>
            );
          }
          const msg = item.msg;
          const msgIndex = messages.indexOf(msg);
          return (
            <MessageBubble
              key={msg.id}
              message={msg.text}
              type={msg.type}
              timestamp={msg.timestamp}
              status={msg.status}
              delay={msgIndex * 60}
              onRetry={msg.status === 'FAILED' && onRetry ? () => onRetry(msg.id) : undefined}
              onFollowUp={onFollowUp}
              diagnosis={msg.diagnosis}
              prescription={msg.prescription}
              diagnosisId={msg.diagnosisId}
              followUpQuestions={msg.followUpQuestions}
              conditions={msg.conditions}
              riskFlags={msg.riskFlags}
              investigations={msg.investigations}
            />
          );
        })}
        {/* Bottom spacing so last bubble clears the input bar */}
        <View className="h-4" />
      </ScrollView>

      {/* Scroll-to-bottom FAB */}
      {showScrollFab && (
        <TouchableOpacity
          onPress={scrollToBottom}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#0f766e',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0d4a40',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Ionicons name="chevron-down" size={22} color="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
};
