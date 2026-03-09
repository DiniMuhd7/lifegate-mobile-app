import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  Text,
} from 'react-native';

import { Background } from 'components/Background';
import { Header } from 'components/Header';
import { MessageList } from 'components/MessageList';
import type { Message as ChatMessage } from 'components/MessageList';
import { ChatInputBar } from 'components/ChatInputBar';
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth-store';
import { GreetingSection } from 'components';
import { router } from 'expo-router';
import { UI_SPACING } from 'constants/constants';

const ChatScreen: React.FC = () => {
  // ✅ Zustand selectors (optimized)
  const activeConversation = useChatStore((state) =>
    state.conversations.find((c) => c.id === state.activeConversationId)
  );

  const sendMessage = useChatStore((state) => state.sendMessage);
  const isThinking = useChatStore((state) => state.isThinking);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);
  const initializeChat = useChatStore((state) => state.initializeChat);

  const { user, logout } = useAuthStore();

  const messages = activeConversation?.messages || [];

  const [showWelcome, setShowWelcome] = useState(true);
  const hasInitialized = useRef(false);

  // ✅ FIX 1: Initialize when user becomes available
  useEffect(() => {
    if (user?.id && !hasInitialized.current) {
      hasInitialized.current = true;
      initializeChat(user.id);
    }
  }, [user?.id, initializeChat]);


  useEffect(() => {
    setShowWelcome(messages.length === 0);
  }, [messages.length]);


  const displayMessages: ChatMessage[] = useMemo(() => {
    return messages.map((msg) => ({
      id: msg.id,
      text: msg.text,
      type: msg.role === 'USER' ? 'sent' : 'received',
      timestamp: new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: msg.status,
    }));
  }, [messages]);

  // ✅ FIX 3: Stable callback
  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage(text);
    },
    [sendMessage]
  );

  // ✅ Error auto-dismiss after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="white" />
      <Background>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
            <View className="pt-4">
              <Header
                onProfilePress={() => router.replace('/(tab)/profile')}
                onMenuPress={() => console.log('Menu pressed')}
                onLogout={async () => {
                  await logout();
                  router.replace('/(auth)/login');
                }}
              />
            </View>

            {showWelcome ? (
              <View className="flex-1 items-center justify-center px-6">
                <GreetingSection userName={user?.name || 'there'} />
              </View>
            ) : (
              <View className="flex-1">
                <MessageList messages={displayMessages} />
              </View>
            )}

            {isThinking && <TypingIndicator />}

            {/* Error banner - shows inline instead of Alert */}
            {error && (
              <View className="mx-4 mb-3 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                <Text className="text-red-700 text-sm font-medium">{error}</Text>
              </View>
            )}

            <ChatInputBar
              onSend={handleSend}
              disabled={isThinking}
              placeholder="Type your message..."
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Background>
    </>
  );
};

export default ChatScreen;

export const TypingIndicator = () => {
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <View className="flex-row gap-1">
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            className="h-2 w-2 rounded-full bg-teal-500"
            style={{ opacity: 0.4 + i * 0.2 }}
          />
        ))}
      </View>
    </View>
  );
};
