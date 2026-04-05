/**
 * Chat Store (Zustand)
 * Manages chat state following the HealthPilot specification:
 * - Optimistic UI (SENDING → SENT/FAILED)
 * - Handles AI orchestration via ChatService
 * - Persists conversations to AsyncStorage
 * - Supports multiple conversations with history
 */

import { create } from 'zustand';
import { Message, Conversation, MessageStatus, ConversationCategory, SessionMode } from 'types/chat-types';
import { ChatService } from 'services/chat-service';
import { SessionService } from 'services/session-service';
import { PersistenceManager } from 'utils/persistenceManager';
import { validateMessage, sanitizeMessage } from 'utils/messageValidator';

// Granular feedback phases shown during AI processing
export type ProcessingPhase = 'sending' | 'analyzing' | 'generating' | null;

type ChatState = {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  userId: string | null;
  isThinking: boolean; // AI is processing
  processingPhase: ProcessingPhase; // Granular feedback during AI processing
  isInitializing: boolean; // Chat loading from storage
  error: string | null;
  // Set when General Health Mode auto-escalates to Clinical Diagnosis Mode
  escalationNotice: string | null;

  // Derived
  activeConversation: Conversation | null;
  messages: Message[]; // Messages of active conversation

  // Actions
  initializeChat: (userId: string) => Promise<void>;
  createConversation: (mode?: SessionMode) => string; // Returns new conversation ID
  setConversationMode: (conversationId: string, mode: SessionMode) => void; // Set mode on an existing conversation
  setActiveConversation: (conversationId: string) => void;
  sendMessage: (text: string, category?: ConversationCategory) => Promise<void>; // User sends message
  retrySendMessage: (messageId: string) => Promise<void>; // Retry a FAILED message
  loadConversationHistory: () => Promise<void>; // Load from storage
  deleteConversation: (conversationId: string) => void;
  processAIResponse: (userMessage: Message, conversationId: string) => Promise<void>;
  clearError: () => void;
  clearEscalationNotice: () => void;
};

// Map a SessionMode to its backend ConversationCategory
const modeToCategory = (mode: SessionMode): ConversationCategory =>
  mode === 'clinical_diagnosis' ? 'doctor_consultation' : 'general_health';

// Urgency levels that trigger client-side escalation detection
const ESCALATION_URGENCY = new Set(['HIGH', 'CRITICAL']);

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Format timestamp
const now = () => Date.now();

export const useChatStore = create<ChatState>((set, get) => ({
  // -------- State --------
  conversations: [],
  activeConversationId: null,
  userId: null,
  isThinking: false,
  processingPhase: null,
  isInitializing: false,
  error: null,
  escalationNotice: null,

  // -------- Derived --------
  get activeConversation() {
    const state = get();
    return (
      state.conversations.find((c) => c.id === state.activeConversationId) ||
      null
    );
  },

  get messages() {
    return get().activeConversation?.messages || [];
  },

  // -------- Actions --------

  // Initialize chat on app boot (load history)
  initializeChat: async (userId: string) => {
    set({ isInitializing: true });
    try {
      const conversations = await PersistenceManager.loadConversations(userId);
      const defaultConvId =
        conversations.length > 0 ? conversations[0].id : generateId();

      set({
        conversations,
        activeConversationId: defaultConvId,
        userId,
      });

      // If no conversations exist, create first one
      if (conversations.length === 0) {
        get().createConversation();
      }
      set({ isInitializing: false });
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      set({ error: 'Failed to load chat history', isInitializing: false });
    }
  },

  // Create new conversation (optionally pre-set session mode & derived category)
  createConversation: (mode?: SessionMode) => {
    const conversationId = generateId();
    const newConversation: Conversation = {
      id: conversationId,
      userId: get().userId || '',
      messages: [],
      ...(mode ? { mode, category: modeToCategory(mode) } : {}),
      createdAt: now(),
      updatedAt: now(),
    };

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      activeConversationId: conversationId,
    }));

    return conversationId;
  },

  // Set the session mode on an existing conversation (also updates derived category)
  setConversationMode: (conversationId: string, mode: SessionMode) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? { ...conv, mode, category: modeToCategory(mode) }
          : conv
      ),
    }));
  },

  // Switch active conversation
  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId, error: null });
  },

  // Main action: User sends message (Step A & B from spec)
  sendMessage: async (text: string, category?: ConversationCategory) => {
    try {
      // Step B: Sanitize and validate
      const sanitized = sanitizeMessage(text);
      const validation = validateMessage(sanitized);
      if (!validation.isValid) {
        set({ error: validation.error });
        return;
      }

      const state = get();
      const convId = state.activeConversationId;
      if (!convId) {
        set({ error: 'No active conversation' });
        return;
      }

      // Step B: Create user message with SENDING status
      const userMessage: Message = {
        id: generateId(),
        role: 'USER',
        status: 'SENDING',
        text: sanitized,
        timestamp: now(),
      };

      // Step B: Optimistic update
      // Only allow a caller-supplied category to override when the conversation
      // has no messages AND no mode has been set (i.e. mode-less quick-start).
      set((state) => {
        const conversations = state.conversations.map((conv) => {
          if (conv.id !== convId) return conv;
          const allowCategoryOverride =
            category && conv.messages.length === 0 && !conv.mode;
          return {
            ...conv,
            ...(allowCategoryOverride ? { category } : {}),
            messages: [...conv.messages, userMessage],
            updatedAt: now(),
          };
        });
        return { conversations, isThinking: true, processingPhase: 'sending' as ProcessingPhase, error: null };
      });

      // Step C: Orchestrate AI response
      await get().processAIResponse(userMessage, convId);
    } catch (error) {
      console.error('Error sending message:', error);
      set({ error: 'Failed to send message', isThinking: false, processingPhase: null });
    }
  },

  // Step C: Process AI response (internal)
  processAIResponse: async (userMessage: Message, conversationId: string) => {
    try {
      // Advance phase: AI is now analyzing the message
      set({ processingPhase: 'analyzing' });

      // Get conversation for context
      const state = get();
      const conversation = state.conversations.find(
        (c) => c.id === conversationId
      );
      if (!conversation) return;

      // Call backend AI via ChatService (pass category for specialized prompting)
      set({ processingPhase: 'generating' });
      const aiResponse = await ChatService.sendMessage(
        conversation.messages.slice(0, -1), // All previous messages
        userMessage.text,
        conversation.category,
        conversation.mode ?? undefined
      );

      // Step D: Handle success
      set((state) => {
        const conversations = state.conversations.map((conv) => {
          if (conv.id !== conversationId) return conv;

          // Update user message status to READ (AI has received and responded)
          const updatedMessages = conv.messages.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: 'READ' as MessageStatus } : msg
          );

          // Append AI message
          const aiMessage: Message = {
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

          updatedMessages.push(aiMessage);

          // Update conversation title if first message
          const title =
            conv.title ||
            `Chat - ${userMessage.text.substring(0, 30)}...`;

          // Auto-escalation to Clinical Diagnosis mode.
          // Triggers when:
          //   a) backend sets escalated flag (authoritative)
          //   b) urgency is HIGH or CRITICAL (client-side fallback)
          //   c) AI sets mode:"clinical" — meaning it detected real symptoms,
          //      regardless of urgency level (handles MEDIUM cases like colds)
          // Works from general_health AND from mode-less conversations.
          const inEscalatableMode =
            conv.mode === 'general_health' || conv.mode === undefined || conv.mode === null;
          const clientSideEscalation =
            inEscalatableMode &&
            aiResponse.diagnosis?.urgency !== undefined &&
            ESCALATION_URGENCY.has(aiResponse.diagnosis.urgency);
          const modeEscalation =
            inEscalatableMode && aiResponse.mode === 'clinical';
          const shouldEscalate =
            (inEscalatableMode && !!aiResponse.escalated) ||
            clientSideEscalation ||
            modeEscalation;

          return {
            ...conv,
            ...(shouldEscalate
              ? { mode: 'clinical_diagnosis' as SessionMode, category: 'doctor_consultation' as ConversationCategory }
              : {}),
            messages: updatedMessages,
            title,
            updatedAt: now(),
          };
        });

        // Build escalation notice text if escalation occurred
        const escalatedConv = conversations.find((c) => c.id === conversationId);
        const wasGeneralHealth = ['general_health', undefined, null].includes(
          state.conversations.find((c) => c.id === conversationId)?.mode as string | undefined
        );
        const didEscalate =
          wasGeneralHealth && escalatedConv?.mode === 'clinical_diagnosis';

        const urgency = aiResponse.diagnosis?.urgency ?? '';
        const escalationNotice = didEscalate
          ? `Your session has been escalated to Clinical Diagnosis mode because a ${
              urgency.toLowerCase()
            }-risk condition was detected. A licensed physician will review your case.`
          : state.escalationNotice;

        return {
          conversations,
          isThinking: false,
          processingPhase: null,
          escalationNotice,
        };
      });


      
      // Step D: Persist to storage
      await PersistenceManager.saveConversations(
        get().conversations,
        get().userId || ''
      );

      // Background-sync: if this conversation is paired with a server session,
      // update its messages and mark it active (in case it was abandoned).
      const syncConv = get().conversations.find((c) => c.id === conversationId);
      if (syncConv?.serverSessionId) {
        SessionService.update(syncConv.serverSessionId, {
          title: syncConv.title,
          messages: syncConv.messages,
          status: 'active',
        }).catch(() => {
          // Non-critical — local storage is the source of truth.
        });

        // Issue 7: Finalize the session when clinical_diagnosis mode produces its
        // first diagnosis. This runs the full EDIS analysis on conversation history
        // and queues the case for physician review.
        // Guard: require at least 3 user messages so basic triage has occurred
        // before the case is sent for physician review.
        const userMessageCount = syncConv.messages.filter((m) => m.role === 'USER').length;
        const isFirstDiagnosis =
          syncConv.mode === 'clinical_diagnosis' &&
          !!aiResponse.diagnosis &&
          userMessageCount >= 3 &&
          syncConv.messages.filter((m) => m.role === 'AI' && m.diagnosisId).length === 1;

        if (isFirstDiagnosis) {
          ChatService.finalize(syncConv.serverSessionId)
            .then((result) => {
              // Stamp the latest AI message with the richer finalized data if it
              // doesn't already have a diagnosis id from the stateless route.
              set((state) => ({
                conversations: state.conversations.map((conv) => {
                  if (conv.id !== conversationId) return conv;
                  const msgs = [...conv.messages];
                  const lastAI = [...msgs].reverse().find((m) => m.role === 'AI');
                  if (!lastAI) return conv;
                  return {
                    ...conv,
                    messages: msgs.map((m) =>
                      m.id === lastAI.id
                        ? {
                            ...m,
                            diagnosisId: result.diagnosisId || m.diagnosisId,
                            conditions: result.conditions ?? m.conditions,
                            riskFlags: result.riskFlags ?? m.riskFlags,
                            investigations: m.investigations,
                          }
                        : m
                    ),
                  };
                }),
              }));
            })
            .catch(() => {
              // Non-critical — stateless route already created the preliminary diagnosis.
            });
        }
      }
    } catch (error) {
      console.error('AI response error:', error);

      // Step D: Error path
      set((state) => {
        const conversations = state.conversations.map((conv) => {
          if (conv.id !== conversationId) return conv;
          return {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === userMessage.id
                ? { ...msg, status: 'FAILED' as MessageStatus }
                : msg
            ),
          };
        });

        const isInsufficientCredits = (error as Error)?.message === 'INSUFFICIENT_CREDITS';
        return {
          conversations,
          isThinking: false,
          processingPhase: null,
          error: isInsufficientCredits
            ? 'INSUFFICIENT_CREDITS'
            : 'Failed to get AI response. Please try again.',
        };
      });
    }
  },

  // Load conversation history from storage
  loadConversationHistory: async () => {
    try {
      const conversations = await PersistenceManager.loadConversations(get().userId || '');
      set({ conversations });
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      set({ error: 'Failed to load history' });
    }
  },

  // Retry a FAILED message
  retrySendMessage: async (messageId: string) => {
    const state = get();
    const convId = state.activeConversationId;
    const conversation = state.conversations.find((c) => c.id === convId);
    if (!convId || !conversation) return;

    const failedMsg = conversation.messages.find(
      (m) => m.id === messageId && m.status === 'FAILED'
    );
    if (!failedMsg) return;

    // Reset message to SENDING
    set((s) => ({
      conversations: s.conversations.map((conv) =>
        conv.id !== convId
          ? conv
          : {
              ...conv,
              messages: conv.messages.map((msg) =>
                msg.id === messageId ? { ...msg, status: 'SENDING' as MessageStatus } : msg
              ),
            }
      ),
      isThinking: true,
      error: null,
    }));

    await get().processAIResponse(failedMsg, convId);
  },

  // Delete a conversation
  deleteConversation: (conversationId: string) => {
    set((state) => {
      const conversations = state.conversations.filter(
        (c) => c.id !== conversationId
      );
      let activeId = state.activeConversationId;

      // Switch to first conversation if active was deleted
      if (activeId === conversationId) {
        activeId = conversations.length > 0 ? conversations[0].id : null;
      }
      return {
        conversations,
        activeConversationId: activeId,
      };
    });
  },
  // Clear error
  clearError: () => set({ error: null }),

  // Clear escalation notice
  clearEscalationNotice: () => set({ escalationNotice: null }),
}));
