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
  BackHandler,
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
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { usePaymentStore } from 'stores/payment-store';

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

const STARTER_CHIPS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
  label: string;
  prompt: string;
}[] = [
  {
    icon: 'pulse-outline',
    color: '#0AADA2',
    bg: '#f0fdfa',
    label: 'Assess Symptoms',
    prompt: 'I have some symptoms I want to describe. Please help me understand what may be happening.',
  },
  {
    icon: 'medkit-outline',
    color: '#0891b2',
    bg: '#e0f2fe',
    label: 'Medication Advice',
    prompt: 'I have a question about a medication — its dosage, side effects, or drug interactions.',
  },
  {
    icon: 'flask-outline',
    color: '#7c3aed',
    bg: '#f5f3ff',
    label: 'Lab Results',
    prompt: 'I have received lab or test results and would like help understanding what they mean.',
  },
  {
    icon: 'people-outline',
    color: '#0f766e',
    bg: '#ccfbf1',
    label: 'See a Physician',
    prompt: 'I would like to be connected to a licensed physician for a clinical consultation.',
  },
];

const ChatScreen: React.FC = () => {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const retrySendMessage = useChatStore((state) => state.retrySendMessage);
  const createConversation = useChatStore((state) => state.createConversation);
  const setConversationMode = useChatStore((state) => state.setConversationMode);
  const isThinking = useChatStore((state) => state.isThinking);
  const processingPhase = useChatStore((state) => state.processingPhase);
  const isInitializing = useChatStore((state) => state.isInitializing);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);
  const clearEscalationNotice = useChatStore((state) => state.clearEscalationNotice);
  const initializeChat = useChatStore((state) => state.initializeChat);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );
  const messages = useMemo(() => activeConversation?.messages || [], [activeConversation]);
  const activeMode = activeConversation?.mode;
  const activeCategory = activeConversation?.category;
  const escalationNotice = activeConversation?.escalationNotice || null;

  const { user, logout } = useAuthStore();
  const fetchBalance = usePaymentStore((state) => state.fetchBalance);
  const [showWelcome, setShowWelcome] = useState(true);
  const showWelcomeRef = useRef(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  // Track which userId was last used to initialize the chat store so that
  // switching accounts always loads the correct user's conversation history.
  const initializedForUserId = useRef<string | null>(null);

  // Hardware back button (Android) — mirrors the back arrow behaviour
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!showWelcomeRef.current) {
        createConversation();
      } else {
        router.replace('/(tab)/health');
      }
      return true; // prevent default back action
    });
    return () => sub.remove();
  }, [createConversation]);

  // Network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);



  useEffect(() => {
    if (!user?.id) {
      // User logged out — reset so the next login always re-initializes.
      initializedForUserId.current = null;
      return;
    }
    if (initializedForUserId.current !== user.id) {
      initializedForUserId.current = user.id;
      initializeChat(user.id);
    }
  }, [user?.id, initializeChat]);

  useEffect(() => {
    setShowWelcome(messages.length === 0);
    showWelcomeRef.current = messages.length === 0;
  }, [messages.length]);

  // Auto-select general_health mode when conversation has no mode set
  useEffect(() => {
    if (!isInitializing && activeConversation && !activeConversation.mode) {
      setConversationMode(activeConversation.id, 'general_health');
    }
  }, [isInitializing, activeConversation?.id, activeConversation?.mode, setConversationMode]);

  useEffect(() => {
    // INSUFFICIENT_CREDITS is not auto-dismissed — user must act (top up or dismiss).
    if (error && error !== 'INSUFFICIENT_CREDITS') {
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
        status: msg.status === 'READ' ? 'SENT' : msg.status,
        diagnosis: msg.diagnosis,
        prescription: msg.prescription,
        diagnosisId: msg.diagnosisId,
        isExistingCase: msg.isExistingCase,
        followUpQuestions: msg.followUpQuestions,
        conditions: msg.conditions,
        riskFlags: msg.riskFlags,
        investigations: msg.investigations,
        physicianSuggestions: msg.physicianSuggestions,
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

  const handleNewChat = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const headerSubtitle = activeMode
    ? MODE_LABELS[activeMode]
    : activeCategory
      ? CATEGORY_LABELS[activeCategory]
      : 'General Health';

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
              {/* Left: Back arrow */}
              <TouchableOpacity
                onPress={() => {
                  if (!showWelcome) {
                    // In an active session — go back to the chat welcome screen
                    createConversation();
                  } else {
                    // Already on welcome — go back to dashboard
                    router.replace('/(tab)/health');
                  }
                }}
                activeOpacity={0.7}
                style={{ padding: 6 }}
              >
                  <Ionicons name="arrow-back" size={26} color="#0f766e" />
              </TouchableOpacity>

              {/* Center: AI identity */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '800',
                    color: '#0f766e',
                    letterSpacing: -0.5,
                  }}
                >
                  Life<Text style={{ color: '#0AADA2' }}>Gate</Text>
                </Text>

              </View>

              {/* Right: Settings */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <TouchableOpacity
                  onPress={() => router.replace('/(tab)/settings')}
                  activeOpacity={0.7}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="settings-outline" size={26} color="#0f766e" />
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
                <TouchableOpacity
                  onPress={() => clearEscalationNotice(activeConversationId ?? undefined)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
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
                  You&apos;re offline. Check your connection to chat with the AI.
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
                  paddingHorizontal: 20,
                  paddingTop: 28,
                  paddingBottom: 16,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* ── AI Identity Hero ── */}
                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  {/* Outer glow ring */}
                  <View
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      backgroundColor: '#ccfbf1',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    {/* Inner icon disc */}
                    <View
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: '#0AADA2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#0AADA2',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.35,
                        shadowRadius: 10,
                        elevation: 6,
                      }}
                    >
                      <Ionicons name="medical" size={28} color="#fff" />
                    </View>
                  </View>

                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '800',
                      color: '#0f766e',
                      textAlign: 'center',
                      letterSpacing: -0.4,
                      lineHeight: 28,
                    }}
                  >
                    {user?.name ? `Hi ${user.name.split(' ')[0]}, ` : 'Hello! '}I&apos;m your{`\n`}AI Health Assistant
                  </Text>

                  <Text
                    style={{
                      fontSize: 13,
                      color: '#64748b',
                      textAlign: 'center',
                      lineHeight: 20,
                      marginTop: 8,
                      paddingHorizontal: 8,
                    }}
                  >
                    Ask about symptoms, medications, lab results, or connect with a licensed physician for a clinical consultation.
                  </Text>

                  {/* Mode badge row */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: '#e0f2fe',
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                      }}
                    >
                      <Ionicons name="sparkles-outline" size={12} color="#0891b2" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0891b2' }}>AI-Powered</Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: '#ccfbf1',
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                      }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={12} color="#0f766e" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f766e' }}>MDCN-Licensed</Text>
                    </View>
                  </View>
                </View>

                {/* ── Conversation starter chips ── */}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: '#94a3b8',
                    textAlign: 'center',
                    marginBottom: 14,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Start a conversation
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    justifyContent: 'space-between',
                  }}
                >
                  {STARTER_CHIPS.map((chip) => (
                    <TouchableOpacity
                      key={chip.label}
                      onPress={() => sendMessage(chip.prompt)}
                      activeOpacity={0.72}
                      style={{
                        width: '47.5%',
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#e5e7eb',
                        borderRadius: 16,
                        padding: 14,
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: chip.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={chip.icon} size={19} color={chip.color} />
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: '#111827',
                          lineHeight: 17,
                        }}
                      >
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View className="flex-1">
                <MessageList 
                  messages={displayMessages} 
                  onRetry={retrySendMessage} 
                  onFollowUp={handleFollowUp}
                  isTyping={isThinking}
                />
              </View>
            )}

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
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#fcd34d',
                  backgroundColor: '#fffbeb',
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flash-outline" size={16} color="#b45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>
                      Out of credits — switched to General Mode
                    </Text>
                    <Text style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                      You can continue chatting in General Mode or top up to resume Clinical Diagnosis.
                    </Text>
                  </View>
                  <TouchableOpacity onPress={clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={16} color="#b45309" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    clearError();
                    router.push('/(tab)/settings/subscription');
                  }}
                  style={{
                    backgroundColor: '#0EA5A4',
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>Top Up to Resume Clinical Diagnosis</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Professional disclaimer */}
            <Text
              style={{
                fontSize: 10,
                color: '#94a3b8',
                textAlign: 'center',
                paddingHorizontal: 20,
                paddingTop: 4,
                lineHeight: 15,
              }}
            >
              LifeGate AI provides health information and clinical diagnosis. All AI outputs are reviewed and validated by licensed physicians. This service does not replace emergency care.
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

