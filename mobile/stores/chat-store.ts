/**
 * Chat Store (Zustand)
 *
 * Owns the client-side chat session lifecycle:
 * - optimistic message updates
 * - cancellable AI orchestration
 * - conversation persistence
 * - escalation and session finalization
 *
 * DESIGN NOTES:
 * - The store keeps raw state only. Components derive active conversation data
 *   with selectors instead of relying on hidden getters.
 * - Async work is guarded with request ids and AbortController so stale AI
 *   completions cannot mutate newer state.
 * - Persistence is handled explicitly with debounced AsyncStorage writes so the
 *   data model remains user-scoped and easy to reason about.
 */

import { create } from 'zustand';
import {
  AIResponse,
  Conversation,
  ConversationCategory,
  FinalizeResult,
  Message,
  MessageStatus,
  SessionMode,
} from 'types/chat-types';
import { ChatService } from 'services/chat-service';
import { SessionService } from 'services/session-service';
import { PersistenceManager } from 'utils/persistenceManager';
import { validateMessage, sanitizeMessage } from 'utils/messageValidator';
import { scheduleFollowUp } from 'utils/followUpScheduler';

// Granular feedback phases shown during AI processing.
export type ProcessingPhase = 'sending' | 'analyzing' | 'generating' | null;

type ConversationSnapshot = {
  conversationId: string;
  requestId: string;
  userMessage: Message;
  previousMessages: Message[];
  previousConversation: Conversation;
  mode?: SessionMode;
  category?: ConversationCategory;
};

export type ChatState = {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  userId: string | null;
  isThinking: boolean;
  processingPhase: ProcessingPhase;
  isInitializing: boolean;
  error: string | null;
  activeRequestId: string | null;
  activeRequestConversationId: string | null;
  activeAbortController: AbortController | null;

  // Actions
  initializeChat: (userId: string) => Promise<void>;
  createConversation: (mode?: SessionMode) => string;
  setConversationMode: (conversationId: string, mode: SessionMode) => void;
  setActiveConversation: (conversationId: string) => void;
  sendMessage: (text: string, category?: ConversationCategory) => Promise<void>;
  retrySendMessage: (messageId: string) => Promise<void>;
  loadConversationHistory: () => Promise<void>;
  deleteConversation: (conversationId: string) => void;
  setConversationServerSessionId: (conversationId: string, serverSessionId: string) => void;
  processAIResponse: (userMessage: Message, conversationId: string) => Promise<void>;
  clearError: () => void;
  clearEscalationNotice: (conversationId?: string) => void;
  resetChatState: () => void;
  flushPendingPersistence: () => Promise<void>;
};

const ESCALATION_URGENCY = new Set(['HIGH', 'CRITICAL']);

const modeToCategory = (mode: SessionMode): ConversationCategory =>
  mode === 'clinical_diagnosis' ? 'doctor_consultation' : 'general_health';

const generateId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const now = () => Date.now();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistSnapshot: { userId: string; conversations: Conversation[] } | null = null;

function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
  };
}

function cloneConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map(cloneConversation);
}

async function persistSnapshot(snapshot: { userId: string; conversations: Conversation[] } | null) {
  if (!snapshot || !snapshot.userId) return;
  await PersistenceManager.saveConversations(snapshot.conversations, snapshot.userId);
}

function scheduleConversationPersist(userId: string, conversations: Conversation[]) {
  if (!userId) return;

  pendingPersistSnapshot = {
    userId,
    conversations: cloneConversations(conversations),
  };

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    const snapshot = pendingPersistSnapshot;
    pendingPersistSnapshot = null;
    persistTimer = null;

    persistSnapshot(snapshot).catch((error) => {
      console.error('Failed to persist conversations:', error);
    });
  }, 300);
}

function getConversation(conversations: Conversation[], conversationId: string) {
  return conversations.find((conversation) => conversation.id === conversationId) || null;
}

function abortActiveRequest(state: ChatState) {
  state.activeAbortController?.abort();
}

function buildUserMessage(text: string): Message {
  return {
    id: generateId(),
    role: 'USER',
    status: 'SENDING',
    text,
    timestamp: now(),
  };
}

function buildAIMessage(aiResponse: AIResponse): Message {
  return {
    id: generateId(),
    role: 'AI',
    status: 'SENT',
    text: aiResponse.text,
    timestamp: now(),
    diagnosis: aiResponse.diagnosis,
    prescription: aiResponse.prescription,
    diagnosisId: aiResponse.diagnosisId,
    isExistingCase: aiResponse.isExistingCase,
    followUpQuestions: aiResponse.followUpQuestions,
    conditions: aiResponse.conditions,
    riskFlags: aiResponse.riskFlags,
    investigations: aiResponse.investigations,
  };
}

function deriveConversationTitle(conversation: Conversation, userMessage: Message) {
  return conversation.title || `Chat - ${userMessage.text.substring(0, 30)}...`;
}

function handleEscalation(
  conversation: Conversation,
  aiResponse: AIResponse,
  previousMode: SessionMode | undefined
) {
  const isEscalatableMode = previousMode === 'general_health' || previousMode == null;
  const clientSideEscalation =
    isEscalatableMode &&
    aiResponse.diagnosis?.urgency !== undefined &&
    ESCALATION_URGENCY.has(aiResponse.diagnosis.urgency);
  const modeEscalation = isEscalatableMode && aiResponse.mode === 'clinical';
  const shouldEscalate =
    (isEscalatableMode && !!aiResponse.escalated) || clientSideEscalation || modeEscalation;

  if (!shouldEscalate) {
    return conversation;
  }

  const urgency = aiResponse.diagnosis?.urgency ?? '';
  const escalationNotice = urgency
    ? `Your session has been escalated to Clinical Diagnosis mode because a ${urgency.toLowerCase()}-risk condition was detected. A licensed physician will review your case.`
    : 'Your session has been escalated to Clinical Diagnosis mode. A licensed physician will review your case.';

  return {
    ...conversation,
    mode: 'clinical_diagnosis' as SessionMode,
    category: 'doctor_consultation' as ConversationCategory,
    escalationNotice,
  };
}

function appendAIMessage(
  conversation: Conversation,
  userMessage: Message,
  aiResponse: AIResponse
) {
  const aiMessage = buildAIMessage(aiResponse);
  const updatedMessages = conversation.messages.map((message) =>
    message.id === userMessage.id ? { ...message, status: 'READ' as MessageStatus } : message
  );

  updatedMessages.push(aiMessage);

  return {
    conversation: {
      ...conversation,
      messages: updatedMessages,
      title: deriveConversationTitle(conversation, userMessage),
      updatedAt: now(),
    },
    aiMessageId: aiMessage.id,
  };
}

async function fetchAIResponse(snapshot: ConversationSnapshot, signal: AbortSignal) {
  return ChatService.sendMessage(
    snapshot.previousMessages,
    snapshot.userMessage.text,
    snapshot.category,
    snapshot.mode,
    signal
  );
}

async function finalizeDiagnosis(sessionId: string, conversationId: string, aiMessageId: string) {
  const result: FinalizeResult = await ChatService.finalize(sessionId);

  useChatStore.setState((state) => ({
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;

      return {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === aiMessageId
            ? {
                ...message,
                diagnosisId: result.diagnosisId || message.diagnosisId,
                conditions: result.conditions ?? message.conditions,
                riskFlags: result.riskFlags ?? message.riskFlags,
              }
            : message
        ),
      };
    }),
  }));

  const state = useChatStore.getState();
  const updatedConversation = getConversation(state.conversations, conversationId);
  if (updatedConversation) {
    scheduleConversationPersist(state.userId || '', state.conversations);
  }
}

async function syncWithServer(
  conversation: Conversation,
  aiResponse: AIResponse,
  aiMessageId: string
) {
  if (!conversation.serverSessionId) return;

  await SessionService.update(conversation.serverSessionId, {
    title: conversation.title,
    messages: conversation.messages,
    status: 'active',
  }).catch(() => {
    // Non-critical — local storage remains the source of truth.
  });

  const userMessageCount = conversation.messages.filter((message) => message.role === 'USER').length;
  const aiDiagnosisCount = conversation.messages.filter(
    (message) => message.role === 'AI' && !!message.diagnosisId
  ).length;
  const isFirstDiagnosis =
    conversation.mode === 'clinical_diagnosis' &&
    !!aiResponse.diagnosis &&
    userMessageCount >= 3 &&
    aiDiagnosisCount === 1;

  if (!isFirstDiagnosis) return;

  await finalizeDiagnosis(conversation.serverSessionId, conversation.id, aiMessageId);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  userId: null,
  isThinking: false,
  processingPhase: null,
  isInitializing: false,
  error: null,
  activeRequestId: null,
  activeRequestConversationId: null,
  activeAbortController: null,

  initializeChat: async (userId: string) => {
    abortActiveRequest(get());
    set({
      isInitializing: true,
      userId,
      activeRequestId: null,
      activeRequestConversationId: null,
      activeAbortController: null,
      isThinking: false,
      processingPhase: null,
      error: null,
    });

    try {
      const conversations = await PersistenceManager.loadConversations(userId);
      const activeConversationId = conversations[0]?.id ?? null;

      set({
        conversations,
        activeConversationId,
        isInitializing: false,
      });

      if (conversations.length === 0) {
        get().createConversation();
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      set({ error: 'Failed to load chat history', isInitializing: false });
    }
  },

  createConversation: (mode?: SessionMode) => {
    const conversationId = generateId();
    const newConversation: Conversation = {
      id: conversationId,
      userId: get().userId || '',
      messages: [],
      escalationNotice: null,
      ...(mode ? { mode, category: modeToCategory(mode) } : {}),
      createdAt: now(),
      updatedAt: now(),
    };

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      activeConversationId: conversationId,
    }));

    scheduleConversationPersist(get().userId || '', get().conversations);

    return conversationId;
  },

  setConversationMode: (conversationId: string, mode: SessionMode) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              mode,
              category: modeToCategory(mode),
              updatedAt: now(),
            }
          : conversation
      ),
    }));

    scheduleConversationPersist(get().userId || '', get().conversations);
  },

  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId, error: null });
  },

  sendMessage: async (text: string, category?: ConversationCategory) => {
    try {
      const state = get();

      if (state.isThinking) {
        set({ error: 'Please wait for the current response before sending another message.' });
        return;
      }

      const sanitized = sanitizeMessage(text);
      const validation = validateMessage(sanitized);
      if (!validation.isValid) {
        set({ error: validation.error });
        return;
      }

      const convId = state.activeConversationId;
      if (!convId) {
        set({ error: 'No active conversation' });
        return;
      }

      const conversation = getConversation(state.conversations, convId);
      if (!conversation) {
        set({ error: 'No active conversation' });
        return;
      }

      const userMessage = buildUserMessage(sanitized);
      const requestId = generateId();
      const abortController = new AbortController();
      const allowCategoryOverride = !!category && conversation.messages.length === 0 && !conversation.mode;

      const snapshot: ConversationSnapshot = {
        conversationId: convId,
        requestId,
        userMessage,
        previousMessages: conversation.messages,
        previousConversation: conversation,
        mode: conversation.mode,
        category: allowCategoryOverride ? category : conversation.category,
      };

      set((current) => ({
        conversations: current.conversations.map((existingConversation) => {
          if (existingConversation.id !== convId) return existingConversation;

          return {
            ...existingConversation,
            ...(allowCategoryOverride ? { category } : {}),
            messages: [...existingConversation.messages, userMessage],
            updatedAt: now(),
          };
        }),
        isThinking: true,
        processingPhase: 'sending',
        error: null,
        activeRequestId: requestId,
        activeRequestConversationId: convId,
        activeAbortController: abortController,
      }));

      await get().processAIResponse(snapshot.userMessage, snapshot.conversationId);
    } catch (error) {
      console.error('Error sending message:', error);
      set({
        error: 'Failed to send message',
        isThinking: false,
        processingPhase: null,
        activeRequestId: null,
        activeRequestConversationId: null,
        activeAbortController: null,
      });
    }
  },

  processAIResponse: async (userMessage: Message, conversationId: string) => {
    const state = get();
    const requestId = state.activeRequestId;
    const abortController = state.activeAbortController;
    const conversationSnapshot = getConversation(state.conversations, conversationId);

    if (!requestId || !abortController || !conversationSnapshot) {
      return;
    }

    try {
      set({ processingPhase: 'analyzing' });

      const snapshot: ConversationSnapshot = {
        conversationId,
        requestId,
        userMessage,
        previousMessages: conversationSnapshot.messages.slice(0, -1),
        previousConversation: conversationSnapshot,
        mode: conversationSnapshot.mode,
        category: conversationSnapshot.category,
      };

      set({ processingPhase: 'generating' });

      const aiResponse = await fetchAIResponse(snapshot, abortController.signal);

      if (abortController.signal.aborted || get().activeRequestId !== requestId) {
        return;
      }

      const appended = appendAIMessage(conversationSnapshot, userMessage, aiResponse);
      const escalatedConversation = handleEscalation(
        appended.conversation,
        aiResponse,
        conversationSnapshot.mode
      );

      set((current) => ({
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId ? escalatedConversation : conversation
        ),
        isThinking: false,
        processingPhase: null,
        activeRequestId: null,
        activeRequestConversationId: null,
        activeAbortController: null,
      }));

      scheduleConversationPersist(get().userId || '', get().conversations);

      const updatedConversation = getConversation(get().conversations, conversationId);
      if (updatedConversation) {
        await syncWithServer(updatedConversation, aiResponse, appended.aiMessageId);
      }

      if (
        aiResponse.followUpPlan &&
        aiResponse.diagnosisId &&
        aiResponse.diagnosis?.condition
      ) {
        scheduleFollowUp(
          aiResponse.diagnosisId,
          aiResponse.diagnosis.condition,
          aiResponse.followUpPlan,
          aiResponse.followUpDate ?? undefined
        ).catch(() => {
          // Non-critical — silently skip if permissions are denied or scheduling fails.
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      console.error('AI response error:', error);

      const isInsufficientCredits = (error as Error)?.message === 'INSUFFICIENT_CREDITS';

      set((current) => ({
        conversations: current.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          return {
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === userMessage.id ? { ...message, status: 'FAILED' as MessageStatus } : message
            ),
            ...(isInsufficientCredits && conversation.mode === 'clinical_diagnosis'
              ? {
                  mode: 'general_health' as SessionMode,
                  category: 'general_health' as ConversationCategory,
                }
              : {}),
          };
        }),
        isThinking: false,
        processingPhase: null,
        activeRequestId: null,
        activeRequestConversationId: null,
        activeAbortController: null,
        error: isInsufficientCredits
          ? 'INSUFFICIENT_CREDITS'
          : 'Failed to get AI response. Please try again.',
      }));

      scheduleConversationPersist(get().userId || '', get().conversations);
    }
  },

  loadConversationHistory: async () => {
    try {
      const conversations = await PersistenceManager.loadConversations(get().userId || '');
      set({ conversations });
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      set({ error: 'Failed to load history' });
    }
  },

  retrySendMessage: async (messageId: string) => {
    const state = get();

    if (state.isThinking) {
      set({ error: 'Please wait for the current response before retrying a message.' });
      return;
    }

    const convId = state.activeConversationId;
    const conversation = state.conversations.find((item) => item.id === convId);
    if (!convId || !conversation) return;

    const failedMsg = conversation.messages.find(
      (message) => message.id === messageId && message.status === 'FAILED'
    );
    if (!failedMsg) return;

    const requestId = generateId();
    const abortController = new AbortController();

    set((current) => ({
      conversations: current.conversations.map((item) =>
        item.id !== convId
          ? item
          : {
              ...item,
              messages: item.messages.map((message) =>
                message.id === messageId ? { ...message, status: 'SENDING' as MessageStatus } : message
              ),
              updatedAt: now(),
            }
      ),
      isThinking: true,
      processingPhase: 'sending',
      error: null,
      activeRequestId: requestId,
      activeRequestConversationId: convId,
      activeAbortController: abortController,
    }));

    await get().processAIResponse(failedMsg, convId);
  },

  deleteConversation: (conversationId: string) => {
    const currentState = get();
    if (currentState.activeRequestConversationId === conversationId) {
      abortActiveRequest(currentState);
    }

    set((state) => {
      const conversations = state.conversations.filter((conversation) => conversation.id !== conversationId);
      const activeConversationId =
        state.activeConversationId === conversationId ? conversations[0]?.id ?? null : state.activeConversationId;

      return {
        conversations,
        activeConversationId,
        activeRequestId: state.activeRequestConversationId === conversationId ? null : state.activeRequestId,
        activeRequestConversationId:
          state.activeRequestConversationId === conversationId ? null : state.activeRequestConversationId,
        activeAbortController:
          state.activeRequestConversationId === conversationId ? null : state.activeAbortController,
      };
    });

    scheduleConversationPersist(get().userId || '', get().conversations);
  },

  setConversationServerSessionId: (conversationId: string, serverSessionId: string) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, serverSessionId, updatedAt: now() }
          : conversation
      ),
    }));

    scheduleConversationPersist(get().userId || '', get().conversations);
  },

  clearError: () => set({ error: null }),

  clearEscalationNotice: (conversationId?: string) => {
    const targetConversationId = conversationId || get().activeConversationId;
    if (!targetConversationId) return;

    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === targetConversationId
          ? { ...conversation, escalationNotice: null, updatedAt: now() }
          : conversation
      ),
    }));

    scheduleConversationPersist(get().userId || '', get().conversations);
  },

  resetChatState: () => {
    abortActiveRequest(get());

    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    pendingPersistSnapshot = null;

    set({
      conversations: [],
      activeConversationId: null,
      userId: null,
      isThinking: false,
      processingPhase: null,
      isInitializing: false,
      error: null,
      activeRequestId: null,
      activeRequestConversationId: null,
      activeAbortController: null,
    });
  },

  flushPendingPersistence: async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    const snapshot = pendingPersistSnapshot;
    pendingPersistSnapshot = null;
    await persistSnapshot(snapshot);
  },
}));