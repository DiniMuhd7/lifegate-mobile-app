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
  SystemMessageType,
  VerifiedPhysician,
} from 'types/chat-types';
import { ChatService } from 'services/chat-service';
import { PaymentService } from 'services/payment-service';
import { SessionService } from 'services/session-service';
import { PersistenceManager } from 'utils/persistenceManager';
import { validateMessage, sanitizeMessage } from 'utils/messageValidator';
import { scheduleFollowUp } from 'utils/followUpScheduler';
import { useProfileStore } from 'stores/auth/profile-store';
import { usePaymentStore } from 'stores/payment-store';

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
  /** diagnosisId of an existing active/pending case being continued in this turn. */
  existingDiagnosisId?: string;
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
  /**
   * Holds a clinical message waiting for patient confirmation before it is
   * sent to the AI (and a credit is deducted).  Set when the user triggers
   * clinical mode for the first time in a conversation; cleared on confirm/cancel.
   */
  pendingClinicalMessage: { text: string; category?: ConversationCategory; conversationId: string } | null;

  /**
   * Set when DX credits are exhausted but the patient has enough LifeCoins to
   * cover the cost of one credit.  Cleared after the patient confirms or
   * declines the LifeCoins payment.
   */
  pendingLifecoinConsent: {
    /** The ID of the failed USER message that should be retried on confirmation. */
    messageId: string;
    conversationId: string;
    lifecoinsBalance: number;
    coinsPerCredit: number;
  } | null;

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
  /** Patient confirmed clinical mode — send the pending message and deduct a credit. */
  confirmClinicalMode: () => Promise<void>;
  /** Patient declined clinical mode — switch back to general and surface an info message. */
  cancelClinicalMode: () => void;
  /** Patient confirmed LifeCoins payment — spend coins and retry the failed message. */
  confirmLifecoinPayment: () => Promise<void>;
  /** Patient declined LifeCoins payment — show the bundle/subscribe prompt instead. */
  cancelLifecoinPayment: () => void;
  clearError: () => void;
  clearEscalationNotice: (conversationId?: string) => void;
  resetChatState: () => void;
  flushPendingPersistence: () => Promise<void>;
};

const ESCALATION_URGENCY = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const TOPUP_MESSAGE =
  "Diagnosis credits are required to access Clinical Diagnosis services. Top up to have licensed doctors review your case and receive a full diagnosis report.";

const modeToCategory = (mode: SessionMode): ConversationCategory =>
  mode === 'clinical_diagnosis' ? 'doctor_consultation' : 'general_health';

const generateId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const now = () => Date.now();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistSnapshot: {
  userId: string;
  conversations: Conversation[];
  changedIds: Set<string> | null; // null = write all
} | null = null;

function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
  };
}

function cloneConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map(cloneConversation);
}

async function persistSnapshot(snapshot: {
  userId: string;
  conversations: Conversation[];
  changedIds: Set<string> | null;
} | null) {
  if (!snapshot || !snapshot.userId) return;
  const { userId, conversations, changedIds } = snapshot;

  if (changedIds === null) {
    // Bulk write (e.g. after migration or initial load)
    await PersistenceManager.saveConversations(conversations, userId);
    return;
  }

  // Hot path: only write the conversations that actually changed
  const toWrite = conversations.filter((c) => changedIds.has(c.id));
  await Promise.all(toWrite.map((c) => PersistenceManager.saveConversation(c, userId)));
}

function scheduleConversationPersist(
  userId: string,
  conversations: Conversation[],
  changedId?: string
) {
  if (!userId) return;

  if (pendingPersistSnapshot) {
    // Accumulate into the existing pending snapshot
    if (pendingPersistSnapshot.changedIds !== null && changedId) {
      pendingPersistSnapshot.changedIds.add(changedId);
    } else {
      // Either no specific ID provided OR already a full-write pending → write all
      pendingPersistSnapshot.changedIds = null;
    }
    pendingPersistSnapshot.conversations = cloneConversations(conversations);
  } else {
    pendingPersistSnapshot = {
      userId,
      conversations: cloneConversations(conversations),
      changedIds: changedId ? new Set([changedId]) : null,
    };
  }

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

function buildAIMessage(aiResponse: AIResponse, physicianSuggestions?: VerifiedPhysician[]): Message {
  return {
    id: generateId(),
    role: 'AI',
    status: 'SENT',
    text: aiResponse.text,
    timestamp: now(),
    diagnosis: aiResponse.diagnosis,
    hasPrescription: aiResponse.hasPrescription,
    diagnosisId: aiResponse.diagnosisId,
    isExistingCase: aiResponse.isExistingCase,
    followUpQuestions: aiResponse.followUpQuestions,
    conditions: aiResponse.conditions,
    riskFlags: aiResponse.riskFlags,
    investigations: aiResponse.investigations,
    physicianSuggestions,
  };
}

/**
 * Keep triage chat natural by showing the full diagnosis card only when it
 * represents a meaningful milestone for the patient.
 *
 * Rules:
 * - Show the diagnosis card whenever the backend has persisted a case
 *   (diagnosisId is set) — this covers both new cases AND existing-case
 *   continuations so the patient always sees their updated case card.
 * - If the same case card was already shown earlier in this conversation,
 *   keep subsequent turns conversational (strip the card to avoid duplication).
 * - When no case has been persisted yet (diagnosisId absent — triage still in
 *   progress), hide only the diagnosis card; conditions/riskFlags/investigations
 *   remain visible so the patient can follow along during triage.
 */
function toConversationalTurn(
  aiResponse: AIResponse,
  conversation: Conversation,
): AIResponse {
  const diagnosisId = aiResponse.diagnosisId;

  if (diagnosisId) {
    // Case was persisted — show the card on its first appearance.
    const alreadyRenderedSameCase = conversation.messages.some(
      (m) => m.role === 'AI' && m.diagnosisId === diagnosisId && !!m.diagnosis,
    );
    if (!alreadyRenderedSameCase) return aiResponse;
    // Card already shown — keep subsequent turns conversational.
    return { ...aiResponse, diagnosis: undefined, prescription: undefined };
  }

  // No persisted case yet (triage in progress) — hide the diagnosis card only.
  return {
    ...aiResponse,
    diagnosis: undefined,
    prescription: undefined,
  };
}

function buildSystemMessage(text: string, systemType: SystemMessageType): Message {
  return {
    id: generateId(),
    role: 'SYSTEM',
    status: 'READ',
    text,
    timestamp: now(),
    systemType,
  };
}

/**
 * Injects a SYSTEM message into the specified conversation and schedules
 * persistence.  Intended to surface in-chat informational or action prompts
 * without routing through the normal AI request pipeline.
 */
function injectSystemMessage(conversationId: string, text: string, systemType: SystemMessageType) {
  const message = buildSystemMessage(text, systemType);
  useChatStore.setState((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.id !== conversationId
        ? conv
        : { ...conv, messages: [...conv.messages, message], updatedAt: now() }
    ),
  }));
  const state = useChatStore.getState();
  scheduleConversationPersist(state.userId || '', state.conversations, conversationId);
}

function deriveConversationTitle(conversation: Conversation, userMessage: Message) {
  return conversation.title || `Chat - ${userMessage.text.substring(0, 30)}...`;
}

/**
 * Returns true when the user message explicitly requests a physician connection.
 * Used to trigger the physician preview cards in Clinical Diagnosis mode.
 */
const PHYSICIAN_INTENT_KEYWORDS = [
  'physician', 'doctor', 'specialist', 'consult', 'consultation',
  'licensed', 'see a physician', 'see a doctor', 'connect me', 'connect to a',
  'medical professional', 'clinical consultation',
];

function isPhysicianRequestIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return PHYSICIAN_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
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
  aiResponse: AIResponse,
  physicianSuggestions?: VerifiedPhysician[]
) {
  const aiMessage = buildAIMessage(aiResponse, physicianSuggestions);
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

async function fetchAIResponse(
  snapshot: ConversationSnapshot,
  signal: AbortSignal,
  attempt = 0
): Promise<AIResponse> {
  try {
    return await ChatService.sendMessage(
      snapshot.previousMessages,
      snapshot.userMessage.text,
      snapshot.category,
      snapshot.mode,
      signal,
      snapshot.existingDiagnosisId,
    );
  } catch (err) {
    // Never retry when the user cancelled the request or it's a credit error.
    if (signal.aborted) throw err;
    if ((err as Error).message === 'INSUFFICIENT_CREDITS') throw err;
    // On a timeout or network error, wait 2 s and retry once.
    // By then the server is warm and AI providers have had time to recover.
    if ((err as any).retryable === true && attempt === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
      if (signal.aborted) throw err;
      return fetchAIResponse(snapshot, signal, 1);
    }
    throw err;
  }
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
    scheduleConversationPersist(state.userId || '', state.conversations, conversationId);
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
  pendingClinicalMessage: null,
  pendingLifecoinConsent: null,

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
      const allConversations = await PersistenceManager.loadConversations(userId);
      // Non-Premium users only see conversations from the last 30 days.
      const isPremium = usePaymentStore.getState().balance?.isPremium ?? false;
      const cutoff = isPremium ? 0 : Date.now() - 30 * 24 * 60 * 60 * 1000;
      const conversations = isPremium
        ? allConversations
        : allConversations.filter((c) => c.updatedAt >= cutoff || c.messages.length === 0);
      // Always activate an empty (fresh) conversation rather than the most-recent
      // one which contains old message history. Old conversations remain in the
      // store and are accessible via the ConversationDrawer.
      const emptyConv = conversations.find((c) => c.messages.length === 0);

      set({
        conversations,
        activeConversationId: emptyConv?.id ?? null,
        isInitializing: false,
      });

      if (!emptyConv) {
        // No clean slot exists — create one so the welcome screen always shows.
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

    scheduleConversationPersist(get().userId || '', get().conversations, conversationId);

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

    scheduleConversationPersist(get().userId || '', get().conversations, conversationId);
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

      // ── Clinical mode confirmation gate (Feature #2 + #3) ──────────────────
      // When the user is triggering clinical_diagnosis for the first time in this
      // conversation (via a starter chip / direct sendMessage call), intercept the
      // message and show an in-chat confirmation prompt.  The credit is NOT deducted
      // until the patient explicitly confirms.
      const isSwitchingToClinical =
        allowCategoryOverride && category === 'doctor_consultation';

      if (isSwitchingToClinical) {
        // Inject only the confirmation system message — the user message itself is
        // held in pendingClinicalMessage.  We DON'T add the user bubble yet so the
        // conversation shows the prompt as the very first item.
        const confirmMsg = buildSystemMessage(
          "You're about to start a Clinical Diagnosis session.\n\nA licensed physician will review your case and each message uses 1 diagnosis credit from your balance.\n\nWould you like to continue?",
          'CONFIRM_CLINICAL'
        );
        set((current) => ({
          conversations: current.conversations.map((conv) =>
            conv.id !== convId
              ? conv
              : { ...conv, messages: [...conv.messages, confirmMsg], updatedAt: now() }
          ),
          pendingClinicalMessage: { text: sanitized, category, conversationId: convId },
        }));
        scheduleConversationPersist(get().userId || '', get().conversations, convId);
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

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

      // Find the most recent diagnosisId from the conversation's AI messages.
      // When present it means the patient is continuing an existing case so the
      // backend should skip credit deduction for this turn.
      const existingDiagnosisId = [...conversationSnapshot.messages]
        .reverse()
        .find((m) => m.role === 'AI' && !!m.diagnosisId)?.diagnosisId;

      // Inject a one-time notice so the patient knows no credits will be charged
      // when they continue triage on an already-opened case.
      if (existingDiagnosisId && conversationSnapshot.mode === 'clinical_diagnosis') {
        const alreadyNotified = conversationSnapshot.messages.some(
          (m) => m.role === 'SYSTEM' && m.text.startsWith('Continuing your existing case')
        );
        if (!alreadyNotified) {
          injectSystemMessage(
            conversationId,
            'Continuing your existing case — no credits will be charged for this triage session.',
            'INFO'
          );
        }
      }

      const snapshot: ConversationSnapshot = {
        conversationId,
        requestId,
        userMessage,
        // Exclude SYSTEM messages — they are UI-only prompts and must never be
        // forwarded to the AI backend as conversation history.
        previousMessages: conversationSnapshot.messages.slice(0, -1).filter((m) => m.role !== 'SYSTEM'),
        previousConversation: conversationSnapshot,
        mode: conversationSnapshot.mode,
        category: conversationSnapshot.category,
        existingDiagnosisId,
      };

      set({ processingPhase: 'generating' });

      const aiResponse = await fetchAIResponse(snapshot, abortController.signal);

      if (abortController.signal.aborted || get().activeRequestId !== requestId) {
        return;
      }

      // Fetch physician preview cards ONLY when the session is explicitly in Clinical
      // Diagnosis mode AND the patient's message signals physician intent (Req 4).
      // Deliberately NOT using aiResponse.mode === 'clinical' here: the AI returns
      // mode='clinical' for almost any symptom message, which would incorrectly
      // trigger physician cards on every health query.
      let physicianSuggestions: VerifiedPhysician[] | undefined;
      const isClinicalMode = conversationSnapshot.mode === 'clinical_diagnosis';
      if (isClinicalMode && isPhysicianRequestIntent(snapshot.userMessage.text)) {
        const physicians = await ChatService.getAvailablePhysicians().catch(() => undefined);
        // Only attach when there are actual physicians to show — an empty array is
        // truthy and would render the "no physicians" fallback card unnecessarily.
        if (physicians && physicians.length > 0) {
          physicianSuggestions = physicians;
        }
      }

      const uiResponse = toConversationalTurn(aiResponse, conversationSnapshot);
      const appended = appendAIMessage(conversationSnapshot, userMessage, uiResponse, physicianSuggestions);
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

      if (
        conversationSnapshot.mode === 'general_health' &&
        escalatedConversation.mode === 'clinical_diagnosis'
      ) {
        try {
          const creditBalance = await PaymentService.getCreditBalance();
          if (!creditBalance?.isPremium && (creditBalance?.balance ?? 0) <= 0) {
            injectSystemMessage(conversationId, TOPUP_MESSAGE, 'MODE_DOWNGRADE');
          }
        } catch {
          // Best-effort only — do not block chat flow when balance fetch fails.
        }
      }

      scheduleConversationPersist(get().userId || '', get().conversations, conversationId);

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

      // Refresh the user's health profile in the auth store when EDIS collected
      // missing profile fields from the patient during this triage turn.
      if (aiResponse.profileUpdated) {
        useProfileStore.getState().getProfile().catch(() => {
          // Best-effort — a failed refresh doesn't affect the chat session.
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      console.error('AI response error:', error);

      const isInsufficientCredits = (error as Error)?.message === 'INSUFFICIENT_CREDITS';
      const wasClinical = conversationSnapshot.mode === 'clinical_diagnosis';

      // Extract LifeCoins fallback data carried by the credit-gate error.
      const lifecoinsBalance = isInsufficientCredits ? ((error as any)?.lifecoinsBalance as number ?? 0) : 0;
      const coinsPerCredit  = isInsufficientCredits ? ((error as any)?.coinsPerCredit  as number ?? 50) : 50;
      const canPayWithCoins = isInsufficientCredits && lifecoinsBalance >= coinsPerCredit;

      // Mark the user's message as failed and, when applicable, downgrade mode.
      // Mode is only downgraded when LifeCoins cannot cover the cost — if the
      // patient can pay with coins we keep clinical mode so the retry succeeds.
      set((current) => ({
        conversations: current.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;

          return {
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === userMessage.id
                ? {
                    ...message,
                    status: 'FAILED' as MessageStatus,
                    failureCode: isInsufficientCredits ? 'INSUFFICIENT_CREDITS' : 'GENERIC',
                  }
                : message
            ),
            // Downgrade to General Mode only when there is no LifeCoins fallback.
            ...(isInsufficientCredits && wasClinical && !canPayWithCoins
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
        // Surface the LifeCoins consent prompt when affordable; otherwise
        // clear the error banner (in-chat message handles the messaging).
        pendingLifecoinConsent: canPayWithCoins
          ? {
              messageId: userMessage.id,
              conversationId,
              lifecoinsBalance,
              coinsPerCredit,
            }
          : null,
        error: isInsufficientCredits ? null : 'Failed to get AI response. Please try again.',
      }));

      scheduleConversationPersist(get().userId || '', get().conversations, conversationId);

      if (isInsufficientCredits) {
        if (!canPayWithCoins) {
          // LifeCoins balance is also insufficient — show the full top-up prompt.
          const hasAnyCoins = lifecoinsBalance > 0;
          const insufficientMsg = hasAnyCoins
            ? `You have ${lifecoinsBalance} LifeCoins but ${coinsPerCredit} are needed for a Dx Credit. Purchase a bundle or subscribe to LifeGate Premium to access Clinical Diagnosis.`
            : 'Diagnosis credits are required to access Clinical Diagnosis services. Top up to have licensed doctors review your case and receive a full diagnosis report.';
          injectSystemMessage(conversationId, insufficientMsg, 'MODE_DOWNGRADE');
        }
        // When canPayWithCoins the consent prompt (pendingLifecoinConsent) handles
        // user communication — no additional in-chat injection needed.
        return;
      }

      // Feature #4: for any other AI failure in clinical mode, notify the patient
      // that their credit has been refunded (the backend refunds synchronously on
      // 5xx before the error reaches the client).
      if (wasClinical) {
        injectSystemMessage(
          conversationId,
          "Something went wrong processing your request. Your diagnosis credit is being restored — this usually takes a moment.",
          'REFUND_PENDING'
        );
        // Give the backend a beat, then confirm the refund to the patient.
        setTimeout(() => {
          injectSystemMessage(
            conversationId,
            "✓ Your diagnosis credit has been restored successfully. You can retry your message.",
            'REFUND_SUCCESS'
          );
        }, 1800);
      }
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
                message.id === messageId
                  ? { ...message, status: 'SENDING' as MessageStatus, failureCode: undefined }
                  : message
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

  confirmClinicalMode: async () => {
    const state = get();
    const pending = state.pendingClinicalMessage;
    if (!pending || state.isThinking) return;

    const { text, category, conversationId } = pending;
    const conversation = getConversation(state.conversations, conversationId);
    if (!conversation) return;

    const userMessage = buildUserMessage(text);
    const requestId = generateId();
    const abortController = new AbortController();

    // Switch conversation to clinical_diagnosis, append user message, start the request.
    set((current) => ({
      conversations: current.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          mode: 'clinical_diagnosis' as SessionMode,
          category: (category ?? 'doctor_consultation') as ConversationCategory,
          messages: [...conv.messages, userMessage],
          updatedAt: now(),
        };
      }),
      pendingClinicalMessage: null,
      isThinking: true,
      processingPhase: 'sending',
      error: null,
      activeRequestId: requestId,
      activeRequestConversationId: conversationId,
      activeAbortController: abortController,
    }));

    await get().processAIResponse(userMessage, conversationId);
  },

  cancelClinicalMode: () => {
    const state = get();
    const pending = state.pendingClinicalMessage;
    if (!pending) return;

    const { conversationId } = pending;

    // Clear pending, switch conversation back to general mode, and inject an
    // info message so the patient knows what happened.
    set((current) => ({
      conversations: current.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          mode: 'general_health' as SessionMode,
          category: 'general_health' as ConversationCategory,
          updatedAt: now(),
        };
      }),
      pendingClinicalMessage: null,
    }));

    injectSystemMessage(
      conversationId,
      "No problem — you're continuing in General Mode. You can always switch to Clinical Diagnosis whenever you're ready.",
      'INFO'
    );
  },

  confirmLifecoinPayment: async () => {
    const state = get();
    const consent = state.pendingLifecoinConsent;
    if (!consent) return;

    const { messageId, conversationId, coinsPerCredit } = consent;

    // Clear the consent prompt immediately so the UI reflects action.
    set({ pendingLifecoinConsent: null, isThinking: true, processingPhase: 'sending', error: null });

    // Inform the patient the transaction is in progress.
    injectSystemMessage(
      conversationId,
      `Using ${coinsPerCredit} LifeCoins to unlock a Dx Credit — please wait…`,
      'INFO'
    );

    try {
      await PaymentService.spendLifecoinsForDx();
    } catch {
      set({ isThinking: false, processingPhase: null });
      injectSystemMessage(
        conversationId,
        'Unable to spend LifeCoins right now. Please try again or top up your Dx Credits.',
        'INFO'
      );
      return;
    }

    // Confirm to the patient that coins were spent.
    injectSystemMessage(
      conversationId,
      `${coinsPerCredit} LifeCoins deducted. Processing your request now…`,
      'INFO'
    );

    // Retry the failed message — the new DX credit will be consumed normally.
    await get().retrySendMessage(messageId);
  },

  cancelLifecoinPayment: () => {
    const state = get();
    const consent = state.pendingLifecoinConsent;
    if (!consent) return;

    const { conversationId, coinsPerCredit } = consent;

    // Downgrade the conversation to General Mode now that the patient declined.
    set((current) => ({
      conversations: current.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          mode: 'general_health' as SessionMode,
          category: 'general_health' as ConversationCategory,
          updatedAt: now(),
        };
      }),
      pendingLifecoinConsent: null,
    }));

    injectSystemMessage(
      conversationId,
      `Dx Credits are required for Clinical Diagnosis. You need ${coinsPerCredit} LifeCoins per credit. Purchase a bundle or subscribe to LifeGate Premium to continue.`,
      'MODE_DOWNGRADE'
    );
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

    // Delete just the one key — no need to rewrite all other conversations.
    PersistenceManager.deleteConversation(conversationId, get().userId || '').catch(() => {});
  },

  setConversationServerSessionId: (conversationId: string, serverSessionId: string) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, serverSessionId, updatedAt: now() }
          : conversation
      ),
    }));

    scheduleConversationPersist(get().userId || '', get().conversations, conversationId);
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

    scheduleConversationPersist(get().userId || '', get().conversations, targetConversationId);
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
      pendingClinicalMessage: null,
      pendingLifecoinConsent: null,
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