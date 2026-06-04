/**
 * ResumeSessionModal
 * Bottom-sheet modal shown when an incomplete (abandoned) server-side chat
 * session is detected on app open.
 *
 * The user can:
 *   Resume Session — restore the incomplete session's messages into the active
 *                    local conversation and navigate to chat.
 *   Start Fresh    — dismiss the session (marks it completed on the server so
 *                    it won't reappear).
 */

import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSessionStore } from 'stores/session-store';
import { useChatStore } from '@/stores/chat-store';
import type { SessionMode } from 'types/chat-types';

export function ResumeSessionModal() {
  const { incompleteSession, updateSession, dismissIncomplete } = useSessionStore();
  const [isResuming, setIsResuming] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  if (!incompleteSession) return null;

  const sessionTitle = incompleteSession.title || 'your previous session';
  const messageCount = Array.isArray(incompleteSession.messages)
    ? incompleteSession.messages.length
    : 0;

  const handleResume = async () => {
    setIsResuming(true);
    try {
      // Mark session as completed on the server — it has been handled and
      // must NOT reappear as abandoned on the next login.
      // (Setting it 'active' would cause the AppState background listener to
      // re-mark it 'abandoned' the next time the app is backgrounded, creating
      // an infinite resume-modal loop.)
      await updateSession(incompleteSession.id, { status: 'completed' });

      // Create a new local conversation pre-loaded with the server messages.
      const { createConversation } = useChatStore.getState();
      const convId = createConversation(
        (incompleteSession.mode as SessionMode) || undefined
      );

      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                title: incompleteSession.title || c.title,
                category: incompleteSession.category || c.category,
                mode: (incompleteSession.mode as SessionMode) || c.mode,
                messages: Array.isArray(incompleteSession.messages)
                  ? incompleteSession.messages
                  : [],
                serverSessionId: incompleteSession.id,
              }
        ),
      }));

      useChatStore.getState().setConversationServerSessionId(convId, incompleteSession.id);
      await useChatStore.getState().flushPendingPersistence();

      // Clear activeServerSessionId so the AppState background listener
      // creates a FRESH server session for any new messages, rather than
      // updating the just-resumed (now completed) session.
      useSessionStore.getState().setActiveServerSessionId(null);

      // Clear the modal.
      useSessionStore.setState({ incompleteSession: null });
    } finally {
      setIsResuming(false);
    }
  };

  const handleStartFresh = async () => {
    setIsDismissing(true);
    try {
      await dismissIncomplete();
    } finally {
      setIsDismissing(false);
    }
  };

  const busy = isResuming || isDismissing;

  return (
    <Modal transparent animationType="slide" visible statusBarTranslucent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl px-6 pt-5 pb-10">
          {/* Handle bar */}
          <View className="w-10 h-1 bg-gray-200 rounded-full self-center mb-5" />

          <Text className="text-xl font-bold text-gray-900 mb-1">
            Resume your session?
          </Text>
          <Text className="text-gray-500 text-[15px] leading-relaxed mb-6">
            You have an incomplete session
            {sessionTitle !== 'your previous session'
              ? ` — "${sessionTitle}"`
              : ''}{' '}
            with {messageCount} message{messageCount !== 1 ? 's' : ''}.{' '}
            Would you like to pick up where you left off?
          </Text>

          {/* Resume */}
          <TouchableOpacity
            onPress={handleResume}
            disabled={busy}
            activeOpacity={0.85}
            className="bg-[#0AADA2] rounded-2xl py-4 items-center mb-3"
          >
            {isResuming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-[16px]">
                Resume Session
              </Text>
            )}
          </TouchableOpacity>

          {/* Start Fresh */}
          <TouchableOpacity
            onPress={handleStartFresh}
            disabled={busy}
            activeOpacity={0.85}
            className="rounded-2xl py-4 items-center border border-gray-200"
          >
            {isDismissing ? (
              <ActivityIndicator color="#6B7280" />
            ) : (
              <Text className="text-gray-600 font-semibold text-[16px]">
                Start Fresh
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
