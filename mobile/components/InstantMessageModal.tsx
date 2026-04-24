/**
 * InstantMessageModal
 *
 * A bottom-sheet panel that provides real-time IM between a patient and the
 * physician assigned to a diagnosis/case.
 *
 * Features
 * ─────────
 * • Slides up from the bottom of the screen as a half-screen overlay.
 * • Drag handle (swipe up → full-screen | swipe down → half-screen → dismiss).
 * • Tap the expand icon to toggle between half and full screen.
 * • Resumes an existing conversation — loaded on first open, never reset while
 *   the modal stays mounted.
 * • Optimistic sends with a temporary "sending" state.
 * • Real-time inbound messages via WebSocket (im.message event).
 * • Read receipts emitted when the modal comes into view.
 * • Works on iOS, Android, and React Native Web.
 */

import React, {
  useCallback,
  useEffect,
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIMStore } from '../stores/im-store';
import { useAuthStore } from '../stores/auth-store';
import { IMMessage } from '../types/im-types';
import wsService from '../services/websocket-service';

// ─── Dimensions ───────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get('window');
const HALF_HEIGHT  = SCREEN_H * 0.52;  // half-screen modal height
const FULL_HEIGHT  = SCREEN_H * 0.92;  // full-screen modal height
const SNAP_DISMISS = SCREEN_H * 0.08;  // minimum drag-down before dismissal

// ─── Props ────────────────────────────────────────────────────────────────────

interface InstantMessageModalProps {
  /** The diagnosis / case ID that scopes this conversation. */
  diagnosisId: string;
  /** Display name of the counterpart (physician or patient). */
  counterpartName: string;
  /** "patient" view = current user is the patient; "physician" = current user is a physician. */
  perspective: 'patient' | 'physician';
  /** Called when the modal should be closed. */
  onClose: () => void;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: IMMessage;
  isSelf: boolean;
}

const Bubble = React.memo(({ message, isSelf }: BubbleProps) => {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={[
        styles.bubble,
        isSelf ? styles.bubbleSelf : styles.bubbleOther,
      ]}
    >
      {!isSelf && (
        <Text style={styles.bubbleSender}>{message.sender_name || 'Physician'}</Text>
      )}
      <Text style={[styles.bubbleText, isSelf && styles.bubbleTextSelf]}>
        {message.content}
      </Text>
      <View style={styles.bubbleMeta}>
        <Text style={[styles.bubbleTime, isSelf && styles.bubbleTimeSelf]}>
          {time}
        </Text>
        {isSelf && (
          <Ionicons
            name={message.read_at ? 'checkmark-done' : 'checkmark'}
            size={12}
            color={message.read_at ? '#60a5fa' : 'rgba(255,255,255,0.55)'}
            style={{ marginLeft: 3 }}
          />
        )}
      </View>
    </View>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function InstantMessageModal({
  diagnosisId,
  counterpartName,
  perspective,
  onClose,
}: InstantMessageModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  // Store
  const { conversations, loadConversation, sendMessage, receiveMessage, receiveReadReceipt } =
    useIMStore();
  const conv = conversations[diagnosisId];
  const messages = conv?.messages ?? [];

  // Input state
  const [text, setText] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Animation
  const slideAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(HALF_HEIGHT)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [currentHeight, setCurrentHeight] = useState(HALF_HEIGHT);

  const listRef = useRef<FlatList>(null);

  // ── Mount: slide in and load messages ────────────────────────────────────
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    loadConversation(diagnosisId);
  }, [diagnosisId]);

  // ── Scroll to bottom whenever messages change ─────────────────────────────
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // ── Real-time WebSocket ───────────────────────────────────────────────────
  useEffect(() => {
    const unsubMsg = wsService.on('im.message', (raw) => {
      const msg = raw as IMMessage;
      if (msg?.diagnosis_id === diagnosisId) {
        receiveMessage(msg);
      }
    });

    const unsubReceipt = wsService.on('im.read_receipt', (raw) => {
      const data = raw as { diagnosis_id?: string };
      if (data?.diagnosis_id === diagnosisId) {
        receiveReadReceipt(diagnosisId);
      }
    });

    return () => {
      unsubMsg();
      unsubReceipt();
    };
  }, [diagnosisId]);

  // ── Toggle full / half screen ─────────────────────────────────────────────
  const toggleFullScreen = useCallback(() => {
    const next = !isFullScreen;
    const targetH = next ? FULL_HEIGHT : HALF_HEIGHT;
    setIsFullScreen(next);
    setCurrentHeight(targetH);
    Animated.spring(heightAnim, {
      toValue: targetH,
      useNativeDriver: false,
      tension: 70,
      friction: 12,
    }).start();
  }, [isFullScreen, heightAnim]);

  // ── Dismiss (slide out) ───────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  }, [slideAnim, onClose]);

  // ── Pan gesture (drag handle) ─────────────────────────────────────────────
  const dragStartHeight = useRef(currentHeight);

  const onDragMove = useCallback(
    (dy: number) => {
      const newH = Math.min(
        FULL_HEIGHT,
        Math.max(HALF_HEIGHT * 0.4, dragStartHeight.current - dy),
      );
      heightAnim.setValue(newH);
    },
    [heightAnim],
  );

  const onDragEnd = useCallback(
    (dy: number) => {
      const newH = dragStartHeight.current - dy;
      if (newH < SNAP_DISMISS) {
        dismiss();
        return;
      }
      const snapFull = newH > (HALF_HEIGHT + FULL_HEIGHT) / 2;
      const targetH = snapFull ? FULL_HEIGHT : HALF_HEIGHT;
      setIsFullScreen(snapFull);
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

  // ── Send handler ──────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || conv?.sending) return;
    setText('');
    sendMessage(diagnosisId, trimmed);
  }, [text, conv?.sending, diagnosisId, sendMessage]);

  // ── Slide transform ───────────────────────────────────────────────────────
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });

  const myRole = perspective === 'patient' ? 'user' : 'professional';

  const renderItem = useCallback(
    ({ item }: { item: IMMessage }) => {
      const isSelf =
        item.sender_id === user?.id || item.sender_role === myRole;
      return <Bubble message={item} isSelf={isSelf} />;
    },
    [user?.id, myRole],
  );

  const keyExtractor = useCallback((item: IMMessage) => item.id, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={dismiss} />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY }],
            height: isFullScreen ? FULL_HEIGHT : undefined,
          },
        ]}
      >
        <Animated.View style={[styles.sheetInner, { height: heightAnim }]}>
          {/* ── Drag Handle ────────────────────────────────────────────── */}
          <DragHandle
            onMove={onDragMove}
            onEnd={onDragEnd}
            onStart={() => { dragStartHeight.current = currentHeight; }}
          />

          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarCircle}>
                <Ionicons
                  name={perspective === 'patient' ? 'medical' : 'person'}
                  size={16}
                  color="#fff"
                />
              </View>
              <View>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {counterpartName || (perspective === 'patient' ? 'Your Physician' : 'Patient')}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {perspective === 'patient' ? 'Assigned physician' : 'Patient'}
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
            {conv?.loading && messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={36} color="#d1d5db" />
                <Text style={styles.emptyText}>Loading conversation…</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={36} color="#d1d5db" />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubtext}>
                  {perspective === 'patient'
                    ? 'Start a conversation with your assigned physician.'
                    : 'Send the patient a message about their case.'}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() =>
                  listRef.current?.scrollToEnd({ animated: false })
                }
              />
            )}

            {/* ── Error banner ────────────────────────────────────────── */}
            {conv?.error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
                <Text style={styles.errorText}>{conv.error}</Text>
              </View>
            ) : null}

            {/* ── Sending indicator ─────────────────────────────────── */}
            {conv?.sending && (
              <View style={styles.sendingRow}>
                <Text style={styles.sendingText}>Sending…</Text>
              </View>
            )}

            {/* ── Input bar ───────────────────────────────────────────── */}
            <View
              style={[
                styles.inputBar,
                { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
              ]}
            >
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 18,
  },
  // ── Drag handle ──────────────────────────────────────────────────────────
  dragHandleWrapper: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    cursor: 'grab' as any,
  },
  dragKnob: {
    width: 40,
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
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0AADA2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    maxWidth: 180,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  // ── Message list ──────────────────────────────────────────────────────────
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
  },
  // ── Bubble ────────────────────────────────────────────────────────────────
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 2,
  },
  bubbleSelf: {
    alignSelf: 'flex-end',
    backgroundColor: '#0AADA2',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 2,
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
    marginTop: 3,
    gap: 2,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#9ca3af',
  },
  bubbleTimeSelf: {
    color: 'rgba(255,255,255,0.65)',
  },
  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#d1d5db',
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── Error / sending ───────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    flex: 1,
  },
  sendingRow: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  sendingText: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  // ── Input bar ─────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: '#f9fafb',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: '#111827',
    textAlignVertical: 'center',
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
