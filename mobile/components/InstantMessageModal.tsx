/**
 * InstantMessageModal
 *
 * A full-screen slide-up chat sheet used for:
 *   - Real IM: patient ↔ physician messaging backed by im-store + WebSocket
 *   - Demo mode: simulated AI conversation, pixel-perfect match to the real IM UI
 *
 * Both modes share the exact same visual shell — Background gradient, header,
 * MessageBubble components, TypingIndicator, and ChatInputBar — so they are
 * indistinguishable at a glance.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIMStore } from '../stores/im-store';
import { useAuthStore } from '../stores/auth-store';
import { IMMessage } from '../types/im-types';
import { ChatInputBar } from './ChatInputBar';
import { TypingIndicator } from './TypingIndicator';

// ─── Props ────────────────────────────────────────────────────────────────────
interface InstantMessageModalProps {
  diagnosisId: string;
  counterpartName: string;
  perspective: 'patient' | 'physician';
  onClose: () => void;
  demoMode?: boolean;
  callDisplayName?: string;
  caseStatus?: string;
  caseCompletedAt?: string;
}

const POST_COMPLETION_WINDOW_MS = 30 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ─── Shared background (matches chatScreen's <Background />) ──────────────────
const ChatBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LinearGradient
    colors={['#d4eee9', '#c2e4de', '#e8f5f2', '#cdeae4']}
    locations={[0, 0.25, 0.6, 1]}
    start={{ x: 0.1, y: 0 }}
    end={{ x: 0.9, y: 1 }}
    style={{ flex: 1 }}
  >
    {/* Ambient glow — matches Background.tsx */}
    <View
      style={{
        position: 'absolute',
        width: 288,
        height: 288,
        borderRadius: 144,
        backgroundColor: 'rgba(255,255,255,0.30)',
        top: -64,
        right: -64,
      }}
    />
    {children}
  </LinearGradient>
);

// ─── Message bubble — matches MessageBubble.tsx visual language ───────────────
interface BubbleProps {
  content: string;
  isOwn: boolean;
  senderName?: string;
  createdAt: string;
  readAt?: string | null;
  failed?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isNew?: boolean;
  onRetry?: () => void;
}

const IMBubble: React.FC<BubbleProps> = ({
  content,
  isOwn,
  senderName,
  createdAt,
  readAt,
  failed,
  isFirstInGroup = true,
  isLastInGroup = true,
  isNew = false,
  onRetry,
}) => {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 10 : 0)).current;

  useEffect(() => {
    if (!isNew) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
    ]).start();
  }, []);

  // iMessage-style adaptive corner radii (mirrors MessageBubble.tsx)
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

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: isLastInGroup ? 14 : 3,
        paddingHorizontal: 14,
      }}
    >
      {/* AI / physician avatar — mirrors MessageBubble's left avatar */}
      {!isOwn ? (
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
            <Ionicons name="medkit-outline" size={15} color="white" />
          </View>
        ) : (
          <View style={{ width: 40, flexShrink: 0 }} />
        )
      ) : null}

      <View style={{ maxWidth: '80%' }}>
        {isOwn ? (
          // Sent — deep teal (matches MessageBubble sent style)
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
              borderWidth: failed ? 1.5 : 0,
              borderColor: failed ? '#ef4444' : 'transparent',
              opacity: failed ? 0.85 : 1,
            }}
          >
            <Text style={{ fontSize: 14, color: '#fff', fontWeight: '500', lineHeight: 22 }}>
              {content}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
              {isLastInGroup && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{formatTime(createdAt)}</Text>
              )}
              {!failed && (
                <Ionicons
                  name={readAt ? 'checkmark-done' : 'checkmark'}
                  size={13}
                  color={readAt ? '#5eead4' : 'rgba(255,255,255,0.55)'}
                />
              )}
            </View>
            {failed && (
              <TouchableOpacity onPress={onRetry} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="refresh-circle" size={14} color="#fca5a5" />
                <Text style={{ fontSize: 11, color: '#fca5a5' }}>Tap to retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          // Received — white card with teal left accent (matches MessageBubble received style)
          <View
            style={{
              ...receivedRadius,
              backgroundColor: '#fff',
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
            {/* Teal left stripe */}
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
            {!isOwn && senderName && isFirstInGroup && (
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0AADA2', marginBottom: 2 }}>
                {senderName}
              </Text>
            )}
            <Text style={{ fontSize: 14, color: '#1e293b', lineHeight: 22 }}>{content}</Text>
            {isLastInGroup && (
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{formatTime(createdAt)}</Text>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

// ─── Shared header bar ────────────────────────────────────────────────────────
const ChatHeader: React.FC<{
  name: string;
  subtitle: string;
  paddingTop: number;
  onClose: () => void;
}> = ({ name, subtitle, paddingTop, onClose }) => (
  <View style={[styles.header, { paddingTop: paddingTop + 10 }]}>
    <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
      <Ionicons name="chevron-down" size={24} color="#0f172a" />
    </TouchableOpacity>
    <View style={styles.headerInfo}>
      <View style={styles.avatar}>
        <Ionicons name="medkit-outline" size={18} color="#0AADA2" />
      </View>
      <View>
        <Text style={styles.headerName}>{name}</Text>
        <Text style={styles.headerSub}>{subtitle}</Text>
      </View>
    </View>
  </View>
);

// ─── Demo AI replies ──────────────────────────────────────────────────────────
const DEMO_REPLIES = [
  "Thanks for reaching out. How long have you been experiencing these symptoms?",
  "I see. On a scale of 1–10, how would you rate the severity right now?",
  "That's helpful. Have you taken any medication for this already?",
  "Understood. Based on what you've shared, I'd recommend staying hydrated and resting. If symptoms worsen, please visit a clinic.",
  "Is there anything else you'd like to ask about your diagnosis report?",
  "I'll note that in your case file. Do you have any allergies I should be aware of?",
  "Great. Please make sure to follow up if you notice any changes. I'm here if you need anything.",
];

// ─── Demo mode ────────────────────────────────────────────────────────────────
const DemoModal: React.FC<{ counterpartName: string; onClose: () => void }> = ({
  counterpartName,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<any>>(null);
  const replyIndex = useRef(0);

  const [messages, setMessages] = useState<
    { id: string; content: string; isOwn: boolean; createdAt: string; readAt: string | null }[]
  >([
    {
      id: 'demo-1',
      content: `Hi! I'm ${counterpartName}. This is a demo — your messages won't be sent to a real physician, but feel free to try out the chat.`,
      isOwn: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      content: trimmed,
      isOwn: true,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Simulate physician typing then reply
    setIsTyping(true);
    const delay = 900 + Math.random() * 800;
    setTimeout(() => {
      setIsTyping(false);
      const reply = DEMO_REPLIES[replyIndex.current % DEMO_REPLIES.length];
      replyIndex.current++;
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          content: reply,
          isOwn: false,
          createdAt: new Date().toISOString(),
          readAt: null,
        },
      ]);
    }, delay);
  }, []);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length, isTyping]);

  // Group consecutive same-sender messages
  const grouped = messages.map((msg, idx) => {
    const prev = idx > 0 ? messages[idx - 1] : null;
    const next = idx < messages.length - 1 ? messages[idx + 1] : null;
    return {
      ...msg,
      isFirstInGroup: !prev || prev.isOwn !== msg.isOwn,
      isLastInGroup: !next || next.isOwn !== msg.isOwn,
      isNew: idx > 0,
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Demo banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="flask-outline" size={13} color="#7c3aed" />
        <Text style={styles.demoBannerText}>Demo — messages are not sent to a real physician</Text>
      </View>

      <ChatBackground>
        <ChatHeader
          name={counterpartName}
          subtitle={isTyping ? 'Typing…' : 'Instant Message · Demo'}
          paddingTop={insets.top}
          onClose={onClose}
        />

        <FlatList
          ref={listRef}
          data={grouped}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <IMBubble
              content={item.content}
              isOwn={item.isOwn}
              senderName={!item.isOwn ? counterpartName : undefined}
              createdAt={item.createdAt}
              readAt={item.readAt}
              isFirstInGroup={item.isFirstInGroup}
              isLastInGroup={item.isLastInGroup}
              isNew={item.isNew}
            />
          )}
          ListFooterComponent={
            isTyping ? <TypingIndicator /> : <View style={{ height: 8 }} />
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      </ChatBackground>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInputBar onSend={handleSend} placeholder="Send a message…" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Real IM mode ─────────────────────────────────────────────────────────────
const RealIM: React.FC<{
  diagnosisId: string;
  counterpartName: string;
  perspective: 'patient' | 'physician';
  onClose: () => void;
  caseStatus?: string;
  caseCompletedAt?: string;
}> = ({ diagnosisId, counterpartName, perspective, onClose, caseStatus, caseCompletedAt }) => {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<any>>(null);

  const { user } = useAuthStore();
  const conv = useIMStore((s) => s.conversations[diagnosisId]);
  const loadConversation = useIMStore((s) => s.loadConversation);
  const refreshConversation = useIMStore((s) => s.refreshConversation);
  const sendMessage = useIMStore((s) => s.sendMessage);
  const retryMessage = useIMStore((s) => s.retryMessage);
  const sendTypingIndicator = useIMStore((s) => s.sendTypingIndicator);
  const clearError = useIMStore((s) => s.clearError);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadConversation(diagnosisId);
    return () => {
      sendTypingIndicator(diagnosisId, false).catch(() => {});
    };
  }, [diagnosisId]);

  const messages = conv?.messages ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      sendTypingIndicator(diagnosisId, false).catch(() => {});
      await sendMessage(
        diagnosisId,
        trimmed,
        perspective === 'physician' ? 'professional' : 'user',
        user?.id ?? 'me',
        user?.name ?? '',
      );
    },
    [diagnosisId, perspective, user, sendMessage, sendTypingIndicator],
  );

  // Build grouped list
  const grouped = messages.map((msg, idx) => {
    const isOwn =
      perspective === 'physician'
        ? msg.sender_role === 'professional'
        : msg.sender_role === 'user';
    const prev = idx > 0 ? messages[idx - 1] : null;
    const next = idx < messages.length - 1 ? messages[idx + 1] : null;
    const prevOwn = prev
      ? perspective === 'physician'
        ? prev.sender_role === 'professional'
        : prev.sender_role === 'user'
      : null;
    const nextOwn = next
      ? perspective === 'physician'
        ? next.sender_role === 'professional'
        : next.sender_role === 'user'
      : null;
    return {
      ...msg,
      isOwn,
      isFirstInGroup: prevOwn === null || prevOwn !== isOwn,
      isLastInGroup: nextOwn === null || nextOwn !== isOwn,
      isNew: idx >= (conv?.messages.length ?? 0) - 3,
    };
  });

  const isLoading = conv?.loading && messages.length === 0;
  const isRefreshing = conv?.refreshing ?? false;
  const counterpartTyping = conv?.counterpartTyping ?? false;

  // Case is closed for new patient messages when it has been Completed for
  // longer than the 30-minute post-completion reply window.
  const isCaseClosed =
    perspective === 'patient' &&
    caseStatus === 'Completed' &&
    !!caseCompletedAt &&
    Date.now() - new Date(caseCompletedAt).getTime() > POST_COMPLETION_WINDOW_MS;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ChatBackground>
        <ChatHeader
          name={counterpartName}
          subtitle={counterpartTyping ? 'Typing…' : 'Instant Message'}
          paddingTop={insets.top}
          onClose={onClose}
        />

        {/* Error banner */}
        {conv?.error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
            <Text style={styles.errorText}>{conv.error}</Text>
            <TouchableOpacity onPress={() => clearError(diagnosisId)} hitSlop={8}>
              <Ionicons name="close" size={14} color="#dc2626" />
            </TouchableOpacity>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#0AADA2" />
            <Text style={styles.loaderText}>Loading messages…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={grouped}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[
              { paddingVertical: 12 },
              messages.length === 0 && { flex: 1, justifyContent: 'center' },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => refreshConversation(diagnosisId)}
                tintColor="#0AADA2"
              />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color="#99f6e4" />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Send a message to {counterpartName}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <IMBubble
                content={item.content}
                isOwn={item.isOwn}
                senderName={!item.isOwn ? item.sender_name || counterpartName : undefined}
                createdAt={item.created_at}
                readAt={item.read_at}
                failed={item._failed}
                isFirstInGroup={item.isFirstInGroup}
                isLastInGroup={item.isLastInGroup}
                isNew={item.isNew}
                onRetry={
                  item._failed
                    ? () => retryMessage(diagnosisId, item.id, item.content)
                    : undefined
                }
              />
            )}
            ListFooterComponent={
              <>
                {counterpartTyping && <TypingIndicator />}
                <View style={{ height: 8 }} />
              </>
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}
      </ChatBackground>

      {isCaseClosed ? (
        <View style={[styles.closedBanner, { paddingBottom: insets.bottom + 12 }]}>
          <Ionicons name="lock-closed-outline" size={16} color="#6b7280" />
          <Text style={styles.closedBannerText}>
            This case is closed. Start a new consultation for further concerns.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={{ paddingBottom: insets.bottom }}>
            <ChatInputBar
              onSend={handleSend}
              placeholder={`Message ${counterpartName}…`}
              disabled={conv?.sending}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

// ─── Root export ──────────────────────────────────────────────────────────────
export function InstantMessageModal({
  diagnosisId,
  counterpartName,
  perspective,
  onClose,
  demoMode = false,
  caseStatus,
  caseCompletedAt,
}: InstantMessageModalProps) {
  if (demoMode) {
    return <DemoModal counterpartName={counterpartName} onClose={onClose} />;
  }
  return (
    <RealIM
      diagnosisId={diagnosisId}
      counterpartName={counterpartName}
      perspective={perspective}
      onClose={onClose}
      caseStatus={caseStatus}
      caseCompletedAt={caseCompletedAt}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,148,136,0.10)',
    gap: 12,
  },
  closeBtn: { padding: 4 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#99f6e4',
  },
  headerName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 1 },

  // Demo banner
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#faf5ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9d5ff',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  demoBannerText: { fontSize: 12, color: '#7c3aed', fontWeight: '600', flex: 1 },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: { flex: 1, fontSize: 12, color: '#dc2626' },

  // Closed-case banner (replaces input bar when post-completion window has elapsed)
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  closedBannerText: { flex: 1, fontSize: 13, color: '#6b7280', textAlign: 'center' },

  // Loading / empty
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: '#0f766e' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#0f766e' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center' },
});
