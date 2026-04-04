import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';

import { Background } from 'components/Background';
import { MessageList } from 'components/MessageList';
import type { Message as ChatMessage } from 'components/MessageList';
import { ChatInputBar } from 'components/ChatInputBar';
import { ProfileMenu } from 'components/ProfileMenu';
import { SuggestedActions } from 'components/SuggestedActions';
import { ModeSelectionModal } from 'components/ModeSelectionModal';
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { usePaymentStore } from 'stores/payment-store';
import { GreetingSection } from 'components';
import { TypingIndicator } from 'components/TypingIndicator';
import type { ConversationCategory, SessionMode } from 'types/chat-types';

const MODE_LABELS: Record<SessionMode, string> = {
  general_health: 'General Health',
  clinical_diagnosis: 'Clinical Diagnosis',
};

const MODE_BADGE: Record<SessionMode, { label: string; color: string; bg: string }> = {
  general_health: { label: 'AI-Only', color: '#0891b2', bg: '#e0f2fe' },
  clinical_diagnosis: { label: 'AI + Physician', color: '#0f766e', bg: '#ccfbf1' },
};

const CATEGORY_LABELS: Record<ConversationCategory, string> = {
  doctor_consultation: 'Doctor Consultation',
  general_health: 'General Health',
  eye_checkup: 'Eye Check Up',
  hearing_test: 'Hearing Test',
  mental_health: 'Mental Health',
};

const ChatScreen: React.FC = () => {
  const activeConversation = useChatStore((state) =>
    state.conversations.find((c) => c.id === state.activeConversationId)
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const retrySendMessage = useChatStore((state) => state.retrySendMessage);
  const createConversation = useChatStore((state) => state.createConversation);
  const setConversationMode = useChatStore((state) => state.setConversationMode);
  const isThinking = useChatStore((state) => state.isThinking);
  const processingPhase = useChatStore((state) => state.processingPhase);
  const isInitializing = useChatStore((state) => state.isInitializing);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);
  const escalationNotice = useChatStore((state) => state.escalationNotice);
  const clearEscalationNotice = useChatStore((state) => state.clearEscalationNotice);
  const initializeChat = useChatStore((state) => state.initializeChat);

  const { user, logout } = useAuthStore();
  const creditBalance = usePaymentStore((state) => state.balance?.balance ?? null);
  const fetchBalance = usePaymentStore((state) => state.fetchBalance);

  const messages = activeConversation?.messages || [];
  const activeCategory = activeConversation?.category;
  const activeMode = activeConversation?.mode;
  const [showWelcome, setShowWelcome] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const hasInitialized = useRef(false);

  // Network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id && !hasInitialized.current) {
      hasInitialized.current = true;
      initializeChat(user.id);
    }
  }, [user?.id, initializeChat]);

  useEffect(() => {
    setShowWelcome(messages.length === 0);
  }, [messages.length]);

  // Auto-prompt mode selection whenever the welcome screen is shown without a mode
  useEffect(() => {
    if (showWelcome && !isInitializing && activeConversation && !activeConversation.mode) {
      setShowModeModal(true);
    }
  }, [showWelcome, isInitializing, activeConversation?.id, activeConversation?.mode]);

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
        diagnosisId: msg.diagnosisId,
        followUpQuestions: msg.followUpQuestions,
        conditions: msg.conditions,
        riskFlags: msg.riskFlags,
        rawTimestamp: msg.timestamp,
      })),
    [messages]
  );

  const handleFollowUp = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  // Fetch credit balance when switching to clinical_diagnosis mode
  useEffect(() => {
    if (activeMode === 'clinical_diagnosis') {
      fetchBalance();
    }
  }, [activeMode, fetchBalance]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleSuggestedAction = useCallback(
    (prompt: string, category: ConversationCategory) => {
      // Doctor Consultation → Clinical Diagnosis mode
      // General Health → General Health mode
      // All other categories send a message directly
      if (category === 'doctor_consultation') {
        if (activeConversation) setConversationMode(activeConversation.id, 'clinical_diagnosis');
        return;
      }
      if (category === 'general_health') {
        if (activeConversation) setConversationMode(activeConversation.id, 'general_health');
        return;
      }
      sendMessage(prompt, category);
    },
    [sendMessage, activeConversation, setConversationMode]
  );

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) {
      // Archive current conversation and create a fresh one, then pick mode
      createConversation();
    }
    setShowModeModal(true);
  }, [createConversation, messages.length]);

  const handleModeSelect = useCallback(
    (mode: SessionMode) => {
      if (activeConversation) {
        setConversationMode(activeConversation.id, mode);
      }
      setShowModeModal(false);
    },
    [activeConversation, setConversationMode]
  );

  const headerSubtitle = activeMode
    ? MODE_LABELS[activeMode]
    : activeCategory
      ? CATEGORY_LABELS[activeCategory]
      : 'Choose a mode to start';

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
                  LifeGate
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
                      backgroundColor: isConnected === false ? '#f59e0b' : '#22c55e',
                    }}
                  />
                  <Text style={{ fontSize: 11, color: '#0f766e' }}>
                    {isConnected === false ? 'Offline' : 'Online'}
                  </Text>
                </View>
              </View>

              {/* Credit balance pill (clinical_diagnosis mode only) */}
              {activeMode === 'clinical_diagnosis' && creditBalance !== null && (
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/subscription')}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: creditBalance === 0 ? '#fef2f2' : '#f0fdf4',
                    borderColor: creditBalance === 0 ? '#fca5a5' : '#86efac',
                    borderWidth: 1,
                    borderRadius: 20,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    marginRight: 4,
                  }}
                >
                  <Ionicons
                    name="flash"
                    size={12}
                    color={creditBalance === 0 ? '#dc2626' : '#16a34a'}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: creditBalance === 0 ? '#dc2626' : '#15803d',
                    }}
                  >
                    {creditBalance}
                  </Text>
                </TouchableOpacity>
              )}

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

            <ModeSelectionModal
              visible={showModeModal}
              onSelect={handleModeSelect}
            />

            {/* ── Escalation notice banner ── */}
            {escalationNotice && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: '#fef9c3',
                  borderBottomWidth: 1,
                  borderBottomColor: '#fde047',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  gap: 8,
                }}
              >
                <Ionicons name="alert-circle" size={18} color="#b45309" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: '#78350f', fontWeight: '500', flex: 1, lineHeight: 18 }}>
                  {escalationNotice}
                </Text>
                <TouchableOpacity onPress={clearEscalationNotice} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color="#b45309" />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Offline banner ── */}
            {isConnected === false && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fef3c7',
                  borderBottomWidth: 1,
                  borderBottomColor: '#fde68a',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  gap: 8,
                }}
              >
                <Ionicons name="cloud-offline-outline" size={16} color="#b45309" />
                <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '500', flex: 1 }}>
                  You're offline. Check your connection to chat with the AI.
                </Text>
              </View>
            )}

            {/* ── Body ── */}
            {isInitializing ? (
              /* Loading skeleton */
              <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
                {[0.85, 0.6, 0.75, 0.5].map((widthFraction, i) => (
                  <View
                    key={i}
                    style={{
                      alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
                      width: `${widthFraction * 100}%`,
                      height: 48,
                      borderRadius: 20,
                      backgroundColor: '#d1faf5',
                      marginBottom: 12,
                      opacity: 0.6 - i * 0.05,
                    }}
                  />
                ))}
                <ActivityIndicator color="#0f766e" style={{ marginTop: 16 }} />
              </View>
            ) : showWelcome ? (
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

                {activeMode ? (
                  /* Active mode badge */
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 24,
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: MODE_BADGE[activeMode].bg,
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Ionicons
                        name={activeMode === 'clinical_diagnosis' ? 'medical' : 'heart'}
                        size={13}
                        color={MODE_BADGE[activeMode].color}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: MODE_BADGE[activeMode].color,
                        }}
                      >
                        {MODE_LABELS[activeMode]} · {MODE_BADGE[activeMode].label}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Always show the static suggested actions */}
                <SuggestedActions onSelect={handleSuggestedAction} />
              </ScrollView>
            ) : (
              <View className="flex-1">
                <MessageList messages={displayMessages} onRetry={retrySendMessage} onFollowUp={handleFollowUp} />
              </View>
            )}

            {/* Typing indicator */}
            {isThinking && <TypingIndicator phase={processingPhase} />}

            {/* Error banner — credit gate gets a dedicated Top-Up CTA */}
            {error && error !== 'INSUFFICIENT_CREDITS' && (
              <View className="mx-4 mb-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
                <Ionicons name="warning-outline" size={16} color="#dc2626" />
                <Text className="text-sm font-medium text-red-700 flex-1">{error}</Text>
                <TouchableOpacity onPress={clearError}>
                  <Ionicons name="close" size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            )}
            {error === 'INSUFFICIENT_CREDITS' && (
              <View className="mx-4 mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex-row items-center gap-2">
                <Ionicons name="flash-outline" size={16} color="#b45309" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-amber-800">
                    You're out of credits
                  </Text>
                  <Text className="text-xs text-amber-700">
                    Clinical Diagnosis requires credits. Top up to continue.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    clearError();
                    router.push('/(tab)/settings/subscription');
                  }}
                  className="rounded-lg bg-[#0EA5A4] px-3 py-1.5">
                  <Text className="text-xs font-bold text-white">Top Up</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* AI disclaimer */}
            <Text
              style={{
                fontSize: 10,
                color: '#64748b',
                textAlign: 'center',
                paddingHorizontal: 16,
                paddingTop: 4,
              }}
            >
              LifeGate AI provides general health information and medical diagnosis under licensed doctor oversight. All AI-generated diagnoses are reviewed and validated by a qualified medical professional.
            </Text>

            <ChatInputBar
              onSend={handleSend}
              disabled={isThinking || isConnected === false}
              placeholder="Describe your symptoms..."
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Background>
    </>
  );
};

export default ChatScreen;

