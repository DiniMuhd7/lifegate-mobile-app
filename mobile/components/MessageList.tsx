import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { FlatList, View, Text, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { UI_SPACING } from 'constants/constants';
import type { Diagnosis, Prescription, ConditionScore, RiskFlag, Investigation, VerifiedPhysician } from 'types/chat-types';

export interface Message {
  id: string;
  text: string;
  type: 'sent' | 'received' | 'system';
  /** Subtype for system messages — drives specialised rendering */
  systemType?: string;
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
  failureCode?: 'INSUFFICIENT_CREDITS' | 'GENERIC';
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  diagnosisId?: string;
  isExistingCase?: boolean;
  // Raw timestamp (ms) for grouping by date
  rawTimestamp?: number;
  // EDIS-specific fields
  followUpQuestions?: string[];
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
  investigations?: Investigation[];
  physicianSuggestions?: VerifiedPhysician[];
}

interface MessageListProps {
  messages: Message[];
  onRetry?: (messageId: string) => void;
  onFollowUp?: (question: string) => void;
  isTyping?: boolean;
  activeMode?: string;
  /** Called when the patient taps Top Up on insufficient-credits notice */
  onTopUp?: () => void;
  /** Called when the patient confirms they want to proceed in Clinical Mode */
  onConfirmClinical?: () => void;
  /** Called when the patient opts to stay in General Mode */
  onCancelClinical?: () => void;
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

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onRetry,
  onFollowUp,
  isTyping,
  activeMode,
  onTopUp,
  onConfirmClinical,
  onCancelClinical,
}) => {
  const flatRef = useRef<FlatList<ListItem>>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const isAtBottomRef = useRef(true);
  // Snapshot the message count on first render — anything beyond this index
  // was added after mount and should animate in. History messages skip animation.
  const initialCountRef = useRef(messages.length);

  // Auto-scroll to bottom whenever a new message is appended,
  // but only when the user is already near the bottom (preserves scroll when reading history).
  useEffect(() => {
    if (isAtBottomRef.current) {
      const t = setTimeout(() => {
        flatRef.current?.scrollToEnd({ animated: true });
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
    flatRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Build list items with date dividers injected.
  // Group flags and msgIndex are precomputed here so renderItem never needs
  // to call messages.indexOf() — O(1) per render instead of O(n).
  type ListItem =
    | { type: 'message'; msg: Message; msgIndex: number; isFirstInGroup: boolean; isLastInGroup: boolean }
    | { type: 'divider'; label: string };

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let lastDateStr = '';
    messages.forEach((msg, idx) => {
      const ts = msg.rawTimestamp ?? Date.now();
      const dateStr = new Date(ts).toDateString();
      if (dateStr !== lastDateStr) {
        items.push({ type: 'divider', label: formatDividerDate(ts) });
        lastDateStr = dateStr;
      }
      const prevMsg = idx > 0 ? messages[idx - 1] : null;
      const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
      items.push({
        type: 'message',
        msg,
        msgIndex: idx,
        isFirstInGroup: !prevMsg || prevMsg.type !== msg.type,
        isLastInGroup: !nextMsg || nextMsg.type !== msg.type,
      });
    });
    return items;
  }, [messages]);

  const keyExtractor = useCallback((item: ListItem, index: number) =>
    item.type === 'divider' ? `divider-${index}` : item.msg.id,
  []);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'divider') {
      return (
        <View
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
    const { msg, msgIndex, isFirstInGroup, isLastInGroup } = item;

    // ── System message rendering ─────────────────────────────────────────────
    if (msg.type === 'system') {
      const isConfirm = msg.systemType === 'CONFIRM_CLINICAL';
      const isSuccess = msg.systemType === 'REFUND_SUCCESS';
      const isDowngrade = msg.systemType === 'MODE_DOWNGRADE';

      // Colour palette varies by type
      const borderColor = isSuccess ? '#86efac' : isDowngrade ? '#fcd34d' : '#99f6e4';
      const bgColor = isSuccess ? '#f0fdf4' : isDowngrade ? '#fffbeb' : '#f0fdfa';
      const iconName: React.ComponentProps<typeof Ionicons>['name'] = isSuccess
        ? 'checkmark-circle'
        : isDowngrade
          ? 'flash-outline'
          : isConfirm
            ? 'medical'
            : 'information-circle-outline';
      const iconColor = isSuccess ? '#16a34a' : isDowngrade ? '#b45309' : '#0f766e';
      const textColor = isSuccess ? '#15803d' : isDowngrade ? '#78350f' : '#134e4a';

      return (
        <View
          style={{
            marginHorizontal: 16,
            marginVertical: 6,
            borderRadius: 16,
            borderWidth: 1,
            borderColor,
            backgroundColor: bgColor,
            padding: 14,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Ionicons name={iconName} size={20} color={iconColor} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, color: textColor, lineHeight: 20, fontWeight: '500' }}>
              {msg.text}
            </Text>
          </View>

          {/* Action buttons for the clinical confirmation prompt */}
          {isConfirm && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={onConfirmClinical}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#0AADA2',
                  borderRadius: 10,
                  paddingVertical: 10,
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Continue in Clinical</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onCancelClinical}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingVertical: 10,
                }}
              >
                <Ionicons name="arrow-back-circle-outline" size={16} color="#64748b" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>Stay in General</Text>
              </TouchableOpacity>
            </View>
          )}

          {isDowngrade && onTopUp && (
            <TouchableOpacity
              onPress={onTopUp}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: '#b45309',
                borderRadius: 10,
                paddingVertical: 10,
              }}
            >
              <Ionicons name="wallet-outline" size={16} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Top Up</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    // ────────────────────────────────────────────────────────────────────────
    // Only animate bubbles that arrived after the initial mount snapshot.
    const isNew = msgIndex >= initialCountRef.current;
    return (
      <MessageBubble
        message={msg.text}
        type={msg.type}
        timestamp={msg.timestamp}
        status={msg.status}
        isNew={isNew}
        onRetry={
          msg.status === 'FAILED' && msg.failureCode !== 'INSUFFICIENT_CREDITS' && onRetry
            ? () => onRetry(msg.id)
            : undefined
        }
        onFollowUp={onFollowUp}
        diagnosis={msg.diagnosis}
        hasPrescription={msg.hasPrescription}
        diagnosisId={msg.diagnosisId}
        isExistingCase={msg.isExistingCase}
        followUpQuestions={msg.followUpQuestions}
        conditions={msg.conditions}
        riskFlags={msg.riskFlags}
        investigations={msg.investigations}
        physicianSuggestions={msg.physicianSuggestions}
        showClinicalContent={activeMode === 'clinical_diagnosis'}
        isFirstInGroup={isFirstInGroup}
        isLastInGroup={isLastInGroup}
      />
    );
  }, [onRetry, onFollowUp, initialCountRef, activeMode]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={flatRef}
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (isAtBottomRef.current) {
            flatRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListFooterComponent={
          <>
            {isTyping && <TypingIndicator />}
            <View style={{ height: 16 }} />
          </>
        }
      />

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
