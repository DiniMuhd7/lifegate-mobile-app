/**
 * InstantMessageModal
 *
 * Bottom-sheet IM panel for real-time patient ↔ physician messaging,
 * scoped to a single diagnosis/case.
 *
 * Improvements
 * ────────────
 * • Date separators ("Today", "Yesterday", "Mon 21 Apr") between days.
 * • Message grouping — consecutive same-sender bubbles are visually merged;
 *   sender name shown only on first bubble, timestamp only on last.
 * • Typing indicator — animated three-dot animation when counterpart types.
 * • Failed-message retry — red bubble with ⚠ tap-to-retry on send failure.
 * • Scroll-to-bottom FAB with "N new messages" banner.
 * • Long-press any bubble → copy to clipboard + haptic feedback.
 * • Character counter (visible from 1 800 chars, limit 2 000).
 * • Pull-to-refresh via refreshConversation.
 * • Auto-dismiss error toast after 4 s.
 * • Avatar with initials derived from the counterpart's name.
 * • Header subtitle switches to "Typing…" when counterpart is typing.
 * • Keyboard dismissed on message-list tap.
 * • isFullScreen derived from currentHeight — no redundant boolean.
 * • Works on iOS, Android, and React Native Web.
 *
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useIMStore } from '../stores/im-store';
import { useAuthStore } from '../stores/auth-store';
import { IMMessage } from '../types/im-types';
import wsService from '../services/websocket-service';

// ─── Dimensions ───────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');
const HALF_HEIGHT  = SCREEN_H * 0.52;
const FULL_HEIGHT  = SCREEN_H * 0.92;
const SNAP_DISMISS = SCREEN_H * 0.08;
const CHAR_WARN    = 1800;

// ─── List item types ──────────────────────────────────────────────────────────

type ListSeparator = { type: 'separator'; id: string; label: string };
type ListMsg = {
  type: 'message';
  id: string;
  message: IMMessage;
  isSelf: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};
type ListItem = ListSeparator | ListMsg;

// ─── Helper utilities ─────────────────────────────────────────────────────────

function dayLabel(iso: string): string {
  const d         = new Date(iso);
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();
  if (same(d, today))     return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function buildListItems(
  messages: IMMessage[],
  userId: string | undefined,
  myRole: 'user' | 'professional',
): ListItem[] {
  const items: ListItem[] = [];
  let currentDay = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const day = dayKey(msg.created_at);

    if (day !== currentDay) {
      currentDay = day;
      items.push({ type: 'separator', id: `sep-${day}`, label: dayLabel(msg.created_at) });
    }

    const isSelf   = msg.sender_id === userId || msg.sender_role === myRole;
    const prev     = messages[i - 1];
    const next     = messages[i + 1];
    const prevSelf = prev && (prev.sender_id === userId || prev.sender_role === myRole);
    const nextSelf = next && (next.sender_id === userId || next.sender_role === myRole);

    const prevIsSame = !!prev && prevSelf === isSelf && dayKey(prev.created_at) === day;
    const nextIsSame = !!next && nextSelf === isSelf && dayKey(next.created_at) === day;

    items.push({
      type: 'message',
      id: msg.id,
      message: msg,
      isSelf,
      isFirstInGroup: !prevIsSame,
      isLastInGroup:  !nextIsSame,
    });
  }
  return items;
}

function getInitials(name: string): string {
  const cleaned = name.trim().replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s*/i, '');
  const parts   = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].substring(0, 2).toUpperCase();
  return '?';
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingDots = React.memo(() => {
  const dot1 = useRef(new Animated.Value(0.35)).current;
  const dot2 = useRef(new Animated.Value(0.35)).current;
  const dot3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const bounce = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1,    duration: 280, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.35, duration: 280, useNativeDriver: true }),
          Animated.delay(Math.max(0, 560 - delay)),
        ]),
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 140);
    const a3 = bounce(dot3, 280);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.typingBubble}>
      {([dot1, dot2, dot3] as Animated.Value[]).map((d, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: d }]} />
      ))}
    </View>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface InstantMessageModalProps {
  /** The diagnosis / case ID that scopes this conversation. */
  diagnosisId: string;
  /** Display name of the counterpart (physician or patient). */
  counterpartName: string;
  /** "patient" = current user is the patient; "physician" = current user is a physician. */
  perspective: 'patient' | 'physician';
  /** Called when the modal should be closed. */
  onClose: () => void;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: IMMessage;
  isSelf: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onRetry: () => void;
}

const Bubble = React.memo(
  ({ message, isSelf, isFirstInGroup, isLastInGroup, onRetry }: BubbleProps) => {
    const time = new Date(message.created_at).toLocaleTimeString([], {
      hour:   '2-digit',
      minute: '2-digit',
    });

    const handleLongPress = useCallback(async () => {
      await Clipboard.setStringAsync(message.content);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, [message.content]);

    /* ── Failed state: red bubble, tap to retry ── */
    if (message._failed) {
      return (
        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.75}
          style={[
            styles.bubble,
            styles.bubbleSelf,
            styles.bubbleFailed,
            isFirstInGroup && styles.bubbleSelfFirst,
            isLastInGroup  && styles.bubbleSelfLast,
            { marginTop: isFirstInGroup ? 6 : 2 },
          ]}
        >
          <Text style={styles.bubbleTextSelf}>{message.content}</Text>
          <View style={styles.bubbleMeta}>
            <Ionicons name="alert-circle" size={12} color="rgba(255,255,255,0.9)" />
            <Text style={[styles.bubbleTimeSelf, { marginLeft: 4 }]}>Tap to retry</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={handleLongPress}
        delayLongPress={400}
        activeOpacity={0.85}
        style={[
          styles.bubble,
          isSelf ? styles.bubbleSelf : styles.bubbleOther,
          isFirstInGroup &&  isSelf && styles.bubbleSelfFirst,
          isFirstInGroup && !isSelf && styles.bubbleOtherFirst,
          isLastInGroup  &&  isSelf && styles.bubbleSelfLast,
          isLastInGroup  && !isSelf && styles.bubbleOtherLast,
          { marginTop: isFirstInGroup ? 6 : 2 },
        ]}
      >
        {!isSelf && isFirstInGroup && (
          <Text style={styles.bubbleSender}>{message.sender_name || 'Physician'}</Text>
        )}
        <Text style={[styles.bubbleText, isSelf && styles.bubbleTextSelf]}>
          {message.content}
        </Text>
        {isLastInGroup && (
          <View style={styles.bubbleMeta}>
            <Text style={[styles.bubbleTime, isSelf && styles.bubbleTimeSelf]}>{time}</Text>
            {isSelf && (
              <Ionicons
                name={message.read_at ? 'checkmark-done' : 'checkmark'}
                size={12}
                color={message.read_at ? '#93c5fd' : 'rgba(255,255,255,0.55)'}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  },
);

// ─── Main Component ───────────────────────────────────────────────────────────

export function InstantMessageModal({
  diagnosisId,
  counterpartName,
  perspective,
  onClose,
}: InstantMessageModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const myRole: 'user' | 'professional' = perspective === 'patient' ? 'user' : 'professional';

  const {
    conversations,
    loadConversation,
    refreshConversation,
    sendMessage,
    retryMessage,
    receiveMessage,
    receiveReadReceipt,
    setCounterpartTyping,
  } = useIMStore();

  const conv     = conversations[diagnosisId];
  const messages = conv?.messages ?? [];

  // ── UI state ─────────────────────────────────────────────────────────────
  const [text, setText]                   = useState('');
  const [currentHeight, setCurrentHeight] = useState(HALF_HEIGHT);
  const [isAtBottom, setIsAtBottom]       = useState(true);
  const [newMsgCount, setNewMsgCount]     = useState(0);

  // isFullScreen is derived — no separate boolean state
  const isFullScreen = currentHeight >= FULL_HEIGHT - 4;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const slideAnim       = useRef(new Animated.Value(0)).current;
  const heightAnim      = useRef(new Animated.Value(HALF_HEIGHT)).current;
  const listRef         = useRef<FlatList>(null);
  const dragStartHeight = useRef(HALF_HEIGHT);
  const prevMsgLen      = useRef(0);

  // ── Build list data (memoised) ────────────────────────────────────────────
  const listItems = useMemo(
    () => buildListItems(messages, user?.id, myRole),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, user?.id, myRole],
  );

  // ── Mount: slide in + load ────────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    loadConversation(diagnosisId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  // ── Scroll to bottom on initial load ─────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0 && prevMsgLen.current === 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
    }
    prevMsgLen.current = messages.length;
  }, [messages.length]);

  // ── Track new messages when scrolled up ──────────────────────────────────
  useEffect(() => {
    if (!isAtBottom && messages.length > prevMsgLen.current) {
      setNewMsgCount((n) => n + 1);
    } else if (isAtBottom) {
      setNewMsgCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ── Auto-dismiss error after 4 s ─────────────────────────────────────────
  useEffect(() => {
    if (!conv?.error) return;
    const timer = setTimeout(() => useIMStore.getState().clearError(diagnosisId), 4000);
    return () => clearTimeout(timer);
  }, [conv?.error, diagnosisId]);

  // ── WebSocket subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    const unsubMsg = wsService.on('im.message', (raw) => {
      const msg = raw as IMMessage;
      if (msg?.diagnosis_id === diagnosisId) receiveMessage(msg);
    });

    const unsubReceipt = wsService.on('im.read_receipt', (raw) => {
      const data = raw as { diagnosis_id?: string };
      if (data?.diagnosis_id === diagnosisId) receiveReadReceipt(diagnosisId);
    });

    const unsubTyping = wsService.on('im.typing', (raw) => {
      const data = raw as { diagnosis_id?: string; typing?: boolean };
      if (data?.diagnosis_id === diagnosisId) setCounterpartTyping(diagnosisId, !!data.typing);
    });

    return () => { unsubMsg(); unsubReceipt(); unsubTyping(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId]);

  // ── Toggle full / half screen ─────────────────────────────────────────────
  const toggleFullScreen = useCallback(() => {
    const targetH = isFullScreen ? HALF_HEIGHT : FULL_HEIGHT;
    setCurrentHeight(targetH);
    Animated.spring(heightAnim, {
      toValue: targetH,
      useNativeDriver: false,
      tension: 70,
      friction: 12,
    }).start();
  }, [isFullScreen, heightAnim]);

  // ── Dismiss ───────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  }, [slideAnim, onClose]);

  // ── Drag callbacks ────────────────────────────────────────────────────────
  const onDragStart = useCallback(() => {
    dragStartHeight.current = currentHeight;
  }, [currentHeight]);

  const onDragMove = useCallback(
    (dy: number) => {
      const newH = Math.min(
        FULL_HEIGHT,
        Math.max(HALF_HEIGHT * 0.35, dragStartHeight.current - dy),
      );
      heightAnim.setValue(newH);
    },
    [heightAnim],
  );

  const onDragEnd = useCallback(
    (dy: number) => {
      const newH = dragStartHeight.current - dy;
      if (newH < SNAP_DISMISS) { dismiss(); return; }
      const snapFull = newH > (HALF_HEIGHT + FULL_HEIGHT) / 2;
      const targetH  = snapFull ? FULL_HEIGHT : HALF_HEIGHT;
      setCurrentHeight(targetH);
      Animated.spring(heightAnim, {
        toValue: targetH,
        useNativeDriver: false,
        tension: 70,
        friction: 12,
      }).start();
    },
    [dismiss, heightAnim],
  );

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || conv?.sending) return;
    setText('');
    sendMessage(diagnosisId, trimmed, myRole, user?.id, user?.name ?? '');
  }, [text, conv?.sending, diagnosisId, sendMessage, myRole, user]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setNewMsgCount(0);
  }, []);

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset:     { y: number };
        contentSize:       { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      const atBottom = distFromBottom < 60;
      setIsAtBottom(atBottom);
      if (atBottom) setNewMsgCount(0);
    },
    [],
  );

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    refreshConversation(diagnosisId);
  }, [diagnosisId, refreshConversation]);

  // ── Slide transform ───────────────────────────────────────────────────────
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  // ── List render helpers ───────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'separator') {
        return (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateLabelText}>{item.label}</Text>
            <View style={styles.dateLine} />
          </View>
        );
      }
      return (
        <Bubble
          message={item.message}
          isSelf={item.isSelf}
          isFirstInGroup={item.isFirstInGroup}
          isLastInGroup={item.isLastInGroup}
          onRetry={() => retryMessage(diagnosisId, item.message.id, item.message.content)}
        />
      );
    },
    [diagnosisId, retryMessage],
  );

  const keyExtractor = useCallback((item: ListItem) => item.id, []);

  // ── Derived display values ────────────────────────────────────────────────
  const initials = useMemo(
    () => getInitials(counterpartName || (perspective === 'patient' ? 'Physician' : 'Patient')),
    [counterpartName, perspective],
  );
  const displayName  = counterpartName || (perspective === 'patient' ? 'Your Physician' : 'Patient');
  const subtitleText = conv?.counterpartTyping
    ? 'Typing…'
    : perspective === 'patient'
    ? 'Assigned physician'
    : 'Patient';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={dismiss} />

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <Animated.View style={[styles.sheetInner, { height: heightAnim }]}>

          {/* ── Drag Handle ────────────────────────────────────────────── */}
          <DragHandle
            onStart={onDragStart}
            onMove={onDragMove}
            onEnd={onDragEnd}
          />

          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
                <Text
                  style={[
                    styles.headerSubtitle,
                    conv?.counterpartTyping && styles.headerSubtitleTyping,
                  ]}
                >
                  {subtitleText}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={toggleFullScreen}
                style={styles.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isFullScreen ? 'contract-outline' : 'expand-outline'}
                  size={19}
                  color="#374151"
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={dismiss}
                style={styles.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Messages ───────────────────────────────────────────────── */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
          >
            {/* Loading / empty states */}
            {conv?.loading && messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={44} color="#d1d5db" />
                <Text style={styles.emptyText}>Loading conversation…</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={44} color="#d1d5db" />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>
                  {perspective === 'patient'
                    ? 'Start a conversation with your assigned physician.'
                    : 'Send the patient a message about their case.'}
                </Text>
              </View>
            ) : (
              <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
                <FlatList
                  ref={listRef}
                  data={listItems}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  contentContainerStyle={styles.messageList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  refreshControl={
                    <RefreshControl
                      refreshing={!!conv?.refreshing}
                      onRefresh={handleRefresh}
                      tintColor="#0AADA2"
                      colors={['#0AADA2']}
                    />
                  }
                  ListFooterComponent={conv?.counterpartTyping ? <TypingDots /> : null}
                />
              </Pressable>
            )}

            {/* ── New-messages banner ──────────────────────────────────── */}
            {newMsgCount > 0 && (
              <TouchableOpacity
                style={styles.newMsgBanner}
                onPress={scrollToEnd}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-down" size={13} color="#fff" style={{ marginRight: 5 }} />
                <Text style={styles.newMsgBannerText}>
                  {newMsgCount} new message{newMsgCount > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}

            {/* ── Scroll-to-bottom FAB ─────────────────────────────────── */}
            {!isAtBottom && messages.length > 0 && newMsgCount === 0 && (
              <TouchableOpacity style={styles.scrollFab} onPress={scrollToEnd} activeOpacity={0.85}>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </TouchableOpacity>
            )}

            {/* ── Error banner (auto-dismissed) ────────────────────────── */}
            {!!conv?.error && (
              <View style={styles.errorBanner}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color="#dc2626"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.errorText} numberOfLines={2}>{conv.error}</Text>
              </View>
            )}

            {/* ── Input bar ───────────────────────────────────────────── */}
            <View
              style={[
                styles.inputBar,
                { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
              ]}
            >
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="Type a message…"
                  placeholderTextColor="#9ca3af"
                  multiline
                  maxLength={2000}
                  returnKeyType="default"
                  blurOnSubmit={false}
                />
                {text.length >= CHAR_WARN && (
                  <Text
                    style={[
                      styles.charCounter,
                      text.length >= 1970 && styles.charCounterWarn,
                    ]}
                  >
                    {text.length}/2000
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={handleSend}
                disabled={!text.trim() || conv?.sending}
                style={[
                  styles.sendBtn,
                  (!text.trim() || conv?.sending) && styles.sendBtnDisabled,
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Animated.View>
    </>
  );
}

// ─── DragHandle ───────────────────────────────────────────────────────────────
// Platform-aware: uses PanResponder on native, pointer events on web.

interface DragHandleProps {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
}

function DragHandle({ onStart, onMove, onEnd }: DragHandleProps) {
  const startY = useRef(0);

  // Both refs must be created unconditionally (rules of hooks).
  // pan is only used on native; on web we use pointer events instead.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => onStart(),
      onPanResponderMove: (_: unknown, gs: { dy: number }) => onMove(gs.dy),
      onPanResponderRelease: (_: unknown, gs: { dy: number }) => onEnd(gs.dy),
    }),
  ).current;

  if (Platform.OS === 'web') {
    return (
      <View
        style={styles.dragHandleWrapper}
        // @ts-ignore — web-only pointer event handlers
        onMouseDown={(e: React.MouseEvent) => {
          startY.current = e.clientY;
          onStart();
          const onMove_ = (ev: MouseEvent) => onMove(ev.clientY - startY.current);
          const onUp   = (ev: MouseEvent) => {
            onEnd(ev.clientY - startY.current);
            window.removeEventListener('mousemove', onMove_);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove_);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <View style={styles.dragKnob} />
      </View>
    );
  }

  return (
    <View style={styles.dragHandleWrapper} {...pan.panHandlers}>
      <View style={styles.dragKnob} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Backdrop & sheet ──────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 101,
  },
  sheetInner: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 20,
  },
  // ── Drag handle ──────────────────────────────────────────────────────────
  dragHandleWrapper: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    cursor: 'grab' as never,
  },
  dragKnob: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0AADA2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  headerSubtitleTyping: {
    color: '#0AADA2',
    fontStyle: 'italic',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  // ── Message list ──────────────────────────────────────────────────────────
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  // ── Date separator ────────────────────────────────────────────────────────
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 8,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
  },
  dateLabelText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },
  // ── Bubble ────────────────────────────────────────────────────────────────
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginBottom: 1,
  },
  bubbleSelf: {
    alignSelf: 'flex-end',
    backgroundColor: '#0AADA2',
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
  },
  // Group-shape corner overrides
  bubbleSelfFirst:  { borderTopRightRadius: 4 },
  bubbleSelfLast:   { borderBottomRightRadius: 4 },
  bubbleOtherFirst: { borderTopLeftRadius: 4 },
  bubbleOtherLast:  { borderBottomLeftRadius: 4 },
  // Failed state
  bubbleFailed: {
    backgroundColor: '#ef4444',
    opacity: 0.92,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 3,
  },
  bubbleText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  bubbleTextSelf: {
    color: '#fff',
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 2,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#9ca3af',
  },
  bubbleTimeSelf: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
  },
  // ── Typing indicator ──────────────────────────────────────────────────────
  typingBubble: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 8,
    gap: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#9ca3af',
  },
  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#c0c7d0',
    textAlign: 'center',
    lineHeight: 19,
  },
  // ── New-message banner ────────────────────────────────────────────────────
  newMsgBanner: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0AADA2',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  newMsgBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  // ── Scroll-to-bottom FAB ──────────────────────────────────────────────────
  scrollFab: {
    position: 'absolute',
    bottom: 72,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0AADA2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  // ── Error banner ──────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
  },
  // ── Input bar ─────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 40,
    maxHeight: 100,
  },
  input: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    padding: 0,
  },
  charCounter: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  charCounterWarn: {
    color: '#ef4444',
    fontWeight: '600',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0AADA2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: '#d1d5db',
  },
});
