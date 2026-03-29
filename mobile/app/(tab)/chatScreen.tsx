import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Background } from 'components/Background';
import { MessageList } from 'components/MessageList';
import type { Message as ChatMessage } from 'components/MessageList';
import { ChatInputBar } from 'components/ChatInputBar';
import { ProfileMenu } from 'components/ProfileMenu';
import { SuggestedActions } from 'components/SuggestedActions';
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { GreetingSection } from 'components';
import { TypingIndicator } from 'components/TypingIndicator';
import type { ConversationCategory } from 'types/chat-types';

const ChatScreen: React.FC = () => {
  const activeConversation = useChatStore((state) =>
    state.conversations.find((c) => c.id === state.activeConversationId)
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const retrySendMessage = useChatStore((state) => state.retrySendMessage);
  const createConversation = useChatStore((state) => state.createConversation);
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
        diagnosis: msg.diagnosis,
        prescription: msg.prescription,
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

  const handleSuggestedAction = useCallback(
    (prompt: string, category: ConversationCategory) => {
      sendMessage(prompt, category);
    },
    [sendMessage]
  );

  const handleNewChat = useCallback(() => {
    createConversation();
  }, [createConversation]);

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <Background>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            {/* ── Header ── */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(99,210,194,0.25)',
              }}
            >
              {/* Left: User avatar */}
              <TouchableOpacity
                onPress={() => router.replace('/(tab)/profile')}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: '#0f766e',
                    backgroundColor: 'rgba(255,255,255,0.35)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="person" size={18} color="#0f766e" />
                </View>
              </TouchableOpacity>

              {/* Center: AI identity */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text
                  style={{ fontSize: 16, fontWeight: '700', color: '#134e4a' }}
                >
                  LifeGate AI
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 2,
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: '#22c55e',
                    }}
                  />
                  <Text style={{ fontSize: 11, color: '#0f766e' }}>
                    Online • AI health guidance
                  </Text>
                </View>
              </View>

              {/* Right: New chat + menu */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <TouchableOpacity
                  onPress={handleNewChat}
                  activeOpacity={0.7}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="add-circle-outline" size={26} color="#0f766e" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowProfileMenu(true)}
                  activeOpacity={0.7}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="menu-outline" size={26} color="#0f766e" />
                </TouchableOpacity>
              </View>
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
              <ScrollView
                className="flex-1"
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 24,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <GreetingSection userName={user?.name || ''} />
                <SuggestedActions onSelect={handleSuggestedAction} />
              </ScrollView>
            ) : (
              <View className="flex-1">
                <MessageList messages={displayMessages} onRetry={retrySendMessage} />
              </View>
            )}

            {/* Typing indicator */}
            {isThinking && <TypingIndicator />}

            {/* Error banner */}
            {error && (
              <View className="mx-4 mb-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
                <Ionicons name="warning-outline" size={16} color="#dc2626" />
                <Text className="text-sm font-medium text-red-700 flex-1">{error}</Text>
                <TouchableOpacity onPress={clearError}>
                  <Ionicons name="close" size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            )}

            <ChatInputBar
              onSend={handleSend}
              disabled={isThinking}
              placeholder="Describe your symptoms..."
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Background>
    </>
  );
};

export default ChatScreen;

