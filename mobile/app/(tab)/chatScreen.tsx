import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Background } from 'components/Background';
import { MessageList } from 'components/MessageList';
import type { Message as ChatMessage } from 'components/MessageList';
import { ChatInputBar } from 'components/ChatInputBar';
import { ProfileMenu } from 'components/ProfileMenu';
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { GreetingSection } from 'components';
import { TypingIndicator } from 'components/TypingIndicator';

const ChatScreen: React.FC = () => {
  const activeConversation = useChatStore((state) =>
    state.conversations.find((c) => c.id === state.activeConversationId)
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const retrySendMessage = useChatStore((state) => state.retrySendMessage);
  const isThinking = useChatStore((state) => state.isThinking);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);
  const initializeChat = useChatStore((state) => state.initializeChat);

  const { user, logout } = useAuthStore();

  const messages = activeConversation?.messages || [];
  const [showWelcome, setShowWelcome] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (user?.id && !hasInitialized.current) {
      hasInitialized.current = true;
      initializeChat(user.id);
    }
  }, [user?.id, initializeChat]);

  useEffect(() => {
    setShowWelcome(messages.length === 0);
  }, [messages.length]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 4000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const displayMessages: ChatMessage[] = useMemo(
    () =>
      messages.map((msg) => ({
        id: msg.id,
        text: msg.text,
        type: msg.role === 'USER' ? 'sent' : 'received',
        timestamp: new Date(msg.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: msg.status,
      })),
    [messages]
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage(text);
    },
    [sendMessage]
  );

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="white" />
      <Background>
        <SafeAreaView className="flex-1 pb-2">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            {/* ── Header ── */}
            <View className="flex-row items-center justify-between px-5 pb-2 pt-8">
              <View className="h-11 w-11 items-center justify-center rounded-full border-2 border-teal-700 bg-white/30">
                <Ionicons name="person" size={22} color="#1a6b5e" />
              </View>
              <TouchableOpacity
                onPress={() => setShowProfileMenu(true)}
                activeOpacity={0.7}
                className="p-1"
              >
                <View className="h-11 w-11 items-center justify-center">
                  <Ionicons name="menu" size={40} color="#1a6b5e" />
                </View>
              </TouchableOpacity>
            </View>

            <ProfileMenu
              visible={showProfileMenu}
              onClose={() => setShowProfileMenu(false)}
              onProfilePress={() => router.replace('/(tab)/profile')}
              onSettingsPress={() => router.replace('/(tab)/settings')}
              onHelpPress={() => router.replace('/(tab)/settings')}
              onLogout={async () => {
                await logout();
                router.replace('/(auth)/login');
              }}
            />

            {/* ── Body ── */}
            {showWelcome ? (
              <View className="flex-1 items-center justify-center px-6">
                <GreetingSection userName={user?.name || 'there'} />
              </View>
            ) : (
              <View className="flex-1">
                <MessageList messages={displayMessages} onRetry={retrySendMessage} />
              </View>
            )}

            {isThinking && <TypingIndicator />}

            {error && (
              <View className="mx-4 mb-3 rounded-lg border border-red-400 bg-red-100 px-3 py-2">
                <Text className="text-sm font-medium text-red-700">{error}</Text>
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
