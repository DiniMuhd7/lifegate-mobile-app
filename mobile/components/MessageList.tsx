import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { MessageBubble } from './MessageBubble';
import { UI_SPACING } from 'constants/constants';

export interface Message {
  id: string;
  text: string;
  type: 'sent' | 'received';
  timestamp?: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
}

interface MessageListProps {
  messages: Message[];
  onRetry?: (messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, onRetry }) => {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerClassName={UI_SPACING.MESSAGE_LIST_PADDING_VERTICAL}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      {messages.map((msg, index) => (
        <MessageBubble
          key={msg.id}
          message={msg.text}
          type={msg.type}
          timestamp={msg.timestamp}
          status={msg.status}
          delay={index * 60}
          onRetry={msg.status === 'FAILED' && onRetry ? () => onRetry(msg.id) : undefined}
        />
      ))}
      {/* Bottom spacing so last bubble clears the input bar */}
      <View className="h-4" />
    </ScrollView>
  );
};
