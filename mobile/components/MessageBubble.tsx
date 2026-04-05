import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { UI_FONT_SIZES, UI_SPACING } from 'constants/constants';
import type { Diagnosis, Prescription, ConditionScore, RiskFlag, Investigation } from 'types/chat-types';
import { DiagnosisCard } from './DiagnosisCard';
import { PrescriptionCard } from './PrescriptionCard';
import { MarkdownText } from './MarkdownText';
import { FollowUpChips } from './FollowUpChips';
import { DifferentialList } from './DifferentialList';
import { RiskFlagList } from './RiskFlagList';
import { InvestigationList } from './InvestigationList';

// Tick/check status indicator for sent messages (WhatsApp-style)
const MessageTicks: React.FC<{ status: 'SENDING' | 'SENT' | 'READ' | 'FAILED' }> = ({ status }) => {
  if (status === 'SENDING') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.5)" />
      </View>
    );
  }
  if (status === 'SENT') {
    // Single grey tick — delivered to server
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.55)" />
      </View>
    );
  }
  if (status === 'READ') {
    // Double teal ticks — AI has read and responded
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -4 }}>
        <Ionicons name="checkmark" size={14} color="#5eead4" />
        <Ionicons name="checkmark" size={14} color="#5eead4" style={{ marginLeft: -6 }} />
      </View>
    );
  }
  return null;
};

interface MessageBubbleProps {
  message: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'READ' | 'FAILED';
  delay?: number;
  onRetry?: () => void;
  onFollowUp?: (question: string) => void;
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  diagnosisId?: string;
  followUpQuestions?: string[];
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
  investigations?: Investigation[];
  /** Whether this is the first bubble in a consecutive same-sender group */
  isFirstInGroup?: boolean;
  /** Whether this is the last bubble in a consecutive same-sender group */
  isLastInGroup?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  type,
  timestamp,
  status,
  delay = 0,
  onRetry,
  onFollowUp,
  diagnosis,
  prescription,
  diagnosisId,
  followUpQuestions,
  conditions,
  riskFlags,
  investigations,
  isFirstInGroup = true,
  isLastInGroup = true,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]),
    ]).start();
  }, []);

  const isSent = type === 'sent';

  const handleLongPress = async () => {
    await Clipboard.setStringAsync(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // iMessage-style adaptive corner radii based on group position
  const sentRadius = {
    borderTopLeftRadius: 20,
    borderTopRightRadius: isFirstInGroup ? 20 : 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: isLastInGroup ? 5 : 14,
  };
  const receivedRadius = {
    borderTopLeftRadius: isFirstInGroup ? 20 : 14,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: isLastInGroup ? 5 : 14,
    borderBottomRightRadius: 20,
  };

  // More gap after the last message in a group
  const marginBottom = isLastInGroup ? 18 : 3;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
        marginBottom,
        paddingHorizontal: 14,
      }}
    >
      {/* AI Avatar — only on the last received bubble in a group */}
      {!isSent ? (
        isLastInGroup ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#0f766e',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              marginBottom: 2,
              flexShrink: 0,
              shadowColor: '#0d4a40',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <Ionicons name="pulse" size={16} color="white" />
          </View>
        ) : (
          // Spacer so non-last bubbles align with last bubble's avatar
          <View style={{ width: 40, flexShrink: 0 }} />
        )
      ) : null}

      {/* Bubble */}
      <TouchableOpacity
        onLongPress={handleLongPress}
        activeOpacity={1}
        delayLongPress={400}
        style={{ maxWidth: '80%' }}
      >
        {isSent ? (
          /* ── Sent bubble ── rich teal, clean, right-anchored */
          <View
            style={{
              ...sentRadius,
              backgroundColor: '#0f766e',
              paddingHorizontal: 16,
              paddingVertical: 10,
              shadowColor: '#0d4a40',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 5,
              elevation: 3,
            }}
          >
            <Text
              style={{
                fontSize: UI_FONT_SIZES.MESSAGE_TEXT,
                color: '#ffffff',
                fontWeight: '500',
                lineHeight: 22,
              }}
            >
              {message}
            </Text>

            {/* Footer: timestamp + tick status */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
                marginTop: 4,
              }}
            >
              {isLastInGroup && timestamp && (
                <Text
                  style={{
                    fontSize: UI_FONT_SIZES.MESSAGE_TIMESTAMP,
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  {timestamp}
                </Text>
              )}
              {status && status !== 'FAILED' && <MessageTicks status={status} />}
            </View>

            {/* Failed indicator */}
            {status === 'FAILED' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                <Ionicons name="alert-circle" size={13} color="#fca5a5" />
                <Text style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS, color: '#fca5a5' }}>
                  Failed
                </Text>
                {onRetry && (
                  <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
                    <Text style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS, color: '#67e8f9', textDecorationLine: 'underline' }}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          /* ── Received bubble ── white card, teal accent left bar, soft shadow */
          <View
            style={{
              ...receivedRadius,
              backgroundColor: '#ffffff',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: 'rgba(13,148,136,0.12)',
              shadowColor: '#0d9488',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {/* Teal left accent stripe */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: receivedRadius.borderTopLeftRadius === 20 ? 10 : 4,
                bottom: receivedRadius.borderBottomLeftRadius === 20 ? 10 : 4,
                width: 3,
                borderRadius: 2,
                backgroundColor: '#0d9488',
                opacity: 0.55,
              }}
            />

            {/* Message text — markdown-rendered */}
            <MarkdownText isSent={false} style={{ fontSize: UI_FONT_SIZES.MESSAGE_TEXT }}>
              {message}
            </MarkdownText>

            {/* Risk flags */}
            {riskFlags && riskFlags.length > 0 && (
              <RiskFlagList riskFlags={riskFlags} />
            )}

            {/* Diagnosis card */}
            {diagnosis && diagnosis.condition?.trim() && (
              <DiagnosisCard diagnosis={diagnosis} diagnosisId={diagnosisId} />
            )}

            {/* Differential diagnosis */}
            {conditions && conditions.length > 0 && (
              <DifferentialList conditions={conditions} />
            )}

            {/* Prescription */}
            {prescription && <PrescriptionCard prescription={prescription} />}

            {/* Investigations */}
            {investigations && investigations.length > 0 && (
              <InvestigationList investigations={investigations} />
            )}

            {/* Follow-up chips */}
            {followUpQuestions && followUpQuestions.length > 0 && onFollowUp && (
              <FollowUpChips questions={followUpQuestions} onSelect={onFollowUp} />
            )}

            {/* Timestamp — only on last in group */}
            {isLastInGroup && timestamp && (
              <Text
                style={{
                  fontSize: UI_FONT_SIZES.MESSAGE_TIMESTAMP,
                  color: '#94a3b8',
                  textAlign: 'left',
                  marginTop: 4,
                }}
              >
                {timestamp}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};
