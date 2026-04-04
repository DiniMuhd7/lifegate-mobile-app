import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { UI_FONT_SIZES, UI_SPACING } from 'constants/constants';
import type { Diagnosis, Prescription, ConditionScore, RiskFlag } from 'types/chat-types';
import { DiagnosisCard } from './DiagnosisCard';
import { PrescriptionCard } from './PrescriptionCard';
import { MarkdownText } from './MarkdownText';
import { FollowUpChips } from './FollowUpChips';
import { DifferentialList } from './DifferentialList';
import { RiskFlagList } from './RiskFlagList';

interface MessageBubbleProps {
  message: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
  delay?: number;
  onRetry?: () => void;
  onFollowUp?: (question: string) => void;
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  diagnosisId?: string;
  followUpQuestions?: string[];
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
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

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
      }}
      className={`${UI_SPACING.MESSAGE_MARGIN_BOTTOM} ${UI_SPACING.MESSAGE_HORIZONTAL_PADDING}`}
    >
      {/* AI Avatar — only for received messages */}
      {!isSent && (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: '#0f766e',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            marginBottom: 2,
            flexShrink: 0,
          }}
        >
          <Ionicons name="pulse" size={15} color="white" />
        </View>
      )}

      {/* Bubble */}
      <TouchableOpacity
        onLongPress={handleLongPress}
        activeOpacity={1}
        delayLongPress={400}
        style={{ maxWidth: '82%' }}
      >
        <View
          className={`
            px-4 py-3
            ${isSent
              ? 'bg-teal-700 rounded-3xl rounded-br-md'
              : 'bg-teal-50 border border-teal-100 rounded-3xl rounded-bl-md'
            }
          `}
        >
          {/* Message text — markdown-rendered for AI, plain for user */}
          {isSent ? (
            <Text
              className="text-white font-medium leading-5"
              style={{ fontSize: UI_FONT_SIZES.MESSAGE_TEXT }}
            >
              {message}
            </Text>
          ) : (
            <MarkdownText isSent={false} style={{ fontSize: UI_FONT_SIZES.MESSAGE_TEXT }}>
              {message}
            </MarkdownText>
          )}

          {/* Risk flags — shown before diagnosis to surface safety signals */}
          {!isSent && riskFlags && riskFlags.length > 0 && (
            <RiskFlagList riskFlags={riskFlags} />
          )}

          {/* Primary diagnosis card */}
          {!isSent && diagnosis && (
            <DiagnosisCard diagnosis={diagnosis} diagnosisId={diagnosisId} />
          )}

          {/* Differential diagnosis list */}
          {!isSent && conditions && conditions.length > 0 && (
            <DifferentialList conditions={conditions} />
          )}

          {/* Prescription card */}
          {!isSent && prescription && <PrescriptionCard prescription={prescription} />}

          {/* Follow-up question chips — at the bottom of the AI bubble */}
          {!isSent && followUpQuestions && followUpQuestions.length > 0 && onFollowUp && (
            <FollowUpChips questions={followUpQuestions} onSelect={onFollowUp} />
          )}

          {/* Timestamp */}
          {timestamp && (
            <Text
              className={`mt-1 ${isSent ? 'text-white text-right' : 'text-gray-400 text-left'}`}
              style={{ fontSize: UI_FONT_SIZES.MESSAGE_TIMESTAMP }}
            >
              {timestamp}
            </Text>
          )}

          {/* Status indicator for sent messages */}
          {isSent && status && (
            <View className="mt-1 flex-row items-center justify-end gap-1">
              {status === 'SENDING' && (
                <>
                  <Ionicons name="ellipsis-horizontal" size={12} color="#a7e8dc" />
                  <Text
                    className="text-teal-200"
                    style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                  >
                    Sending...
                  </Text>
                </>
              )}
              {status === 'FAILED' && (
                <>
                  <Ionicons name="alert-circle" size={12} color="#ef4444" />
                  <Text
                    className="text-red-400"
                    style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                  >
                    Failed to send
                  </Text>
                  {onRetry && (
                    <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
                      <Text
                        className="text-teal-300 underline"
                        style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                      >
                        Retry
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

interface MessageBubbleProps {
  message: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
  delay?: number;
  onRetry?: () => void;
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  diagnosisId?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  type,
  timestamp,
  status,
  delay = 0,
  onRetry,
  diagnosis,
  prescription,
  diagnosisId,
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

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
      }}
      className={`${UI_SPACING.MESSAGE_MARGIN_BOTTOM} ${UI_SPACING.MESSAGE_HORIZONTAL_PADDING}`}
    >
      {/* AI Avatar — only for received messages */}
      {!isSent && (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: '#0f766e',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            marginBottom: 2,
            flexShrink: 0,
          }}
        >
          <Ionicons name="pulse" size={15} color="white" />
        </View>
      )}

      {/* Bubble */}
      <TouchableOpacity
        onLongPress={handleLongPress}
        activeOpacity={1}
        delayLongPress={400}
        style={{ maxWidth: '82%' }}
      >
        <View
          className={`
            px-4 py-3
            ${isSent
              ? 'bg-teal-700 rounded-3xl rounded-br-md'
              : 'bg-teal-50 border border-teal-100 rounded-3xl rounded-bl-md'
            }
          `}
        >
        <Text
          className={`leading-5 ${
            isSent ? 'text-white font-medium' : 'text-gray-800 font-normal'
          }`}
          style={{ fontSize: UI_FONT_SIZES.MESSAGE_TEXT }}
        >
          {message}
        </Text>

        {/* Diagnosis card — only for AI messages */}
        {!isSent && diagnosis && <DiagnosisCard diagnosis={diagnosis} diagnosisId={diagnosisId} />}

        {/* Prescription card — only for AI messages */}
        {!isSent && prescription && <PrescriptionCard prescription={prescription} />}

        {/* Timestamp */}
        {timestamp && (
          <Text
            className={`mt-1 ${isSent ? 'text-white text-right' : 'text-gray-400 text-left'}`}
            style={{ fontSize: UI_FONT_SIZES.MESSAGE_TIMESTAMP }}
          >
            {timestamp}
          </Text>
        )}

        {/* Status indicator for sent messages */}
        {isSent && status && (
          <View className="mt-1 flex-row items-center justify-end gap-1">
            {status === 'SENDING' && (
              <>
                <Ionicons name="ellipsis-horizontal" size={12} color="#a7e8dc" />
                <Text
                  className="text-teal-200"
                  style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                >
                  Sending...
                </Text>
              </>
            )}
            {status === 'FAILED' && (
              <>
                <Ionicons name="alert-circle" size={12} color="#ef4444" />
                <Text
                  className="text-red-400"
                  style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                >
                  Failed to send
                </Text>
                {onRetry && (
                  <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
                    <Text
                      className="text-teal-300 underline"
                      style={{ fontSize: UI_FONT_SIZES.MESSAGE_STATUS }}
                    >
                      Retry
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};