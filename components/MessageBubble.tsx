import React, { useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_FONT_SIZES, UI_SPACING } from 'constants/constants';

interface MessageBubbleProps {
  message: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
  delay?: number;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  type,
  timestamp,
  status,
  delay = 0,
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

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
      className={`flex-row ${UI_SPACING.MESSAGE_MARGIN_BOTTOM} ${UI_SPACING.MESSAGE_HORIZONTAL_PADDING} ${isSent ? 'justify-end' : 'justify-start'}`}
    >
      <View
        className={`
          max-w-[72%] px-4 py-3
          ${isSent
            ? 'bg-teal-700 rounded-3xl rounded-br-md'
            : 'bg-teal-50 border border-teal-100 rounded-3xl rounded-bl-md '
          }
        `}
      >
        <Text
          className={`leading-5 ${
            isSent ? 'text-white font-medium' : 'text-black font-normal'
          }`}
          style={{ fontSize: UI_FONT_SIZES.MESSAGE_TEXT }}
        >
          {message}
        </Text>

        {timestamp && (
          <Text
            className={`mt-1 ${
              isSent ? 'text-white text-right' : 'text-black text-left'
            }`}
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
              </>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
};