import { create } from 'zustand';
import { IMMessage, IMConversation } from '../types/im-types';
import { IMService } from '../services/im-service';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface IMState {
  /** One conversation slot per diagnosed case (keyed by diagnosisId) */
  conversations: Record<string, IMConversation>;

  /** Load (or refresh) a conversation. Marks incoming messages as read. */
  loadConversation: (diagnosisId: string) => Promise<void>;

  /** Pull-to-refresh: reload messages keeping existing ones visible. */
  refreshConversation: (diagnosisId: string) => Promise<void>;

  /** Sync unread count from backend for a conversation. */
  syncUnreadCount: (diagnosisId: string) => Promise<void>;

  /** Optimistically append a sent message, then confirm with the server. */
  sendMessage: (
    diagnosisId: string,
    content: string,
    senderRole?: 'user' | 'professional',
    senderId?: string,
    senderName?: string,
  ) => Promise<void>;

  /** Re-send a message that previously failed (_failed: true). */
  retryMessage: (diagnosisId: string, messageId: string, content: string) => Promise<void>;

  /** Apply a real-time inbound message received via WebSocket. */
  receiveMessage: (msg: IMMessage) => void;

  /** Apply a real-time read-receipt (marks all prior messages as read). */
  receiveReadReceipt: (diagnosisId: string) => void;

  /** Reset a single conversation's error state. */
  clearError: (diagnosisId: string) => void;

  /** Update counterpart typing indicator (from im.typing WS event). */
  setCounterpartTyping: (diagnosisId: string, isTyping: boolean) => void;

  /** Send typing indicator to the counterpart (true = typing, false = stopped). */
  sendTypingIndicator: (diagnosisId: string, isTyping: boolean) => Promise<void>;
}

// ─── Default conversation factory ────────────────────────────────────────────

function emptyConversation(diagnosisId: string): IMConversation {
  return {
    diagnosisId,
    messages: [],
    unreadCount: 0,
    loading: false,
    refreshing: false,
    sending: false,
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shallow equality over an object's own enumerable key–value pairs.
 * Used to bail out early before creating new object references that would
 * otherwise trigger re-renders on every Zustand subscriber.
 */
function shallowEq<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

/**
 * Returns a new conversations record with the single entry for `diagnosisId`
 * patched.  If the patch produces no observable change (shallow-equal), the
 * original record is returned untouched, keeping every Zustand selector that
 * depends on sibling conversations stable (no spurious re-renders).
 */
function patchConversation(
  conversations: Record<string, IMConversation>,
  diagnosisId: string,
  patch: Partial<IMConversation>,
): Record<string, IMConversation> {
  const existing = conversations[diagnosisId] ?? emptyConversation(diagnosisId);
  const patched: IMConversation = { ...existing, ...patch };
  // Bail out when nothing actually changed — both the conversation slot and the
  // root record keep the same reference, so no subscriber re-renders.
  if (shallowEq(existing, patched)) return conversations;
  return { ...conversations, [diagnosisId]: patched };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useIMStore = create<IMState>((set, get) => ({
  conversations: {},

  // ── loadConversation ───────────────────────────────────────────────────────
  loadConversation: async (diagnosisId) => {
    set((s) => ({
      conversations: patchConversation(s.conversations, diagnosisId, {
        loading: true,
        error: null,
      }),
    }));

    try {
      const messages = await IMService.getMessages(diagnosisId);
      set((s) => ({
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages,
          unreadCount: 0, // server already marked them read during GET
          loading: false,
        }),
      }));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load messages';
      set((s) => ({
        conversations: patchConversation(s.conversations, diagnosisId, {
          loading: false,
          error: message,
        }),
      }));
    }
  },

  // ── sendMessage ────────────────────────────────────────────────────────────
  sendMessage: async (
    diagnosisId,
    content,
    senderRole = 'user',
    senderId = 'me',
    senderName = '',
  ) => {
    const tempId = `optimistic-${Date.now()}`;
    const optimistic: IMMessage = {
      id: tempId,
      diagnosis_id: diagnosisId,
      sender_id: senderId,
      sender_role: senderRole,
      sender_name: senderName,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    // Optimistic append
    set((s) => {
      const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
      return {
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages: [...conv.messages, optimistic],
          sending: true,
          error: null,
        }),
      };
    });

    try {
      const saved = await IMService.sendMessage(diagnosisId, content);
      // Replace optimistic entry with the confirmed server record
      set((s) => {
        const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
        return {
          conversations: patchConversation(s.conversations, diagnosisId, {
            messages: conv.messages.map((m) => (m.id === tempId ? saved : m)),
            sending: false,
          }),
        };
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send message';
      // Keep the optimistic entry but mark it as failed (enables retry).
      set((s) => {
        const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
        return {
          conversations: patchConversation(s.conversations, diagnosisId, {
            messages: conv.messages.map((m) =>
              m.id === tempId ? { ...m, _failed: true } : m,
            ),
            sending: false,
            error: message,
          }),
        };
      });
    }
  },

  // ── retryMessage ────────────────────────────────────────────────────────────
  retryMessage: async (diagnosisId, messageId, content) => {
    // Clear the failed flag and mark as sending.
    set((s) => {
      const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
      return {
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages: conv.messages.map((m) =>
            m.id === messageId ? { ...m, _failed: false } : m,
          ),
          sending: true,
          error: null,
        }),
      };
    });

    try {
      const saved = await IMService.sendMessage(diagnosisId, content);
      set((s) => {
        const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
        return {
          conversations: patchConversation(s.conversations, diagnosisId, {
            messages: conv.messages.map((m) => (m.id === messageId ? saved : m)),
            sending: false,
          }),
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      set((s) => {
        const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
        return {
          conversations: patchConversation(s.conversations, diagnosisId, {
            messages: conv.messages.map((m) =>
              m.id === messageId ? { ...m, _failed: true } : m,
            ),
            sending: false,
            error: message,
          }),
        };
      });
    }
  },

  // ── refreshConversation ────────────────────────────────────────────────────
  refreshConversation: async (diagnosisId) => {
    set((s) => ({
      conversations: patchConversation(s.conversations, diagnosisId, {
        refreshing: true,
        error: null,
      }),
    }));

    try {
      const messages = await IMService.getMessages(diagnosisId);
      set((s) => ({
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages,
          unreadCount: 0,
          refreshing: false,
        }),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to refresh messages';
      set((s) => ({
        conversations: patchConversation(s.conversations, diagnosisId, {
          refreshing: false,
          error: message,
        }),
      }));
    }
  },

  // ── syncUnreadCount ──────────────────────────────────────────────────────
  syncUnreadCount: async (diagnosisId) => {
    try {
      const count = await IMService.getUnreadCount(diagnosisId);
      set((s) => ({
        conversations: patchConversation(s.conversations, diagnosisId, {
          unreadCount: count,
        }),
      }));
    } catch {
      // Best effort: keep existing in-memory unread count on transient failures.
    }
  },

  // ── receiveMessage ─────────────────────────────────────────────────────────
  receiveMessage: (msg) => {
    set((s) => {
      const conv =
        s.conversations[msg.diagnosis_id] ?? emptyConversation(msg.diagnosis_id);
      // Avoid duplicates (server echo)
      if (conv.messages.some((m) => m.id === msg.id)) return s;
      return {
        conversations: patchConversation(s.conversations, msg.diagnosis_id, {
          messages: [...conv.messages, msg],
          unreadCount: conv.unreadCount + 1,
        }),
      };
    });
  },

  // ── receiveReadReceipt ─────────────────────────────────────────────────────
  receiveReadReceipt: (diagnosisId) => {
    set((s) => {
      const conv = s.conversations[diagnosisId];
      if (!conv) return s;      // If every message is already read, skip the update entirely — the map
      // would produce a new array with identical elements, which shallowEq
      // cannot detect (array identity changes even when content is the same).
      if (!conv.messages.some((m) => !m.read_at)) return s;      const now = new Date().toISOString();
      return {
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages: conv.messages.map((m) =>
            m.read_at ? m : { ...m, read_at: now },
          ),
          unreadCount: 0,
        }),
      };
    });
  },

  // ── clearError ─────────────────────────────────────────────────────────────
  clearError: (diagnosisId) => {
    set((s) => ({
      conversations: patchConversation(s.conversations, diagnosisId, {
        error: null,
      }),
    }));
  },

  // ── setCounterpartTyping ───────────────────────────────────────────────────
  setCounterpartTyping: (diagnosisId, isTyping) => {
    set((s) => {
      const conv = s.conversations[diagnosisId];
      // Skip if the typing state is unchanged — im.typing events fire on every
      // keystroke and we must not churn the store on identical values.
      if (conv?.counterpartTyping === isTyping) return s;
      return {
        conversations: patchConversation(s.conversations, diagnosisId, {
          counterpartTyping: isTyping,
        }),
      };
    });
  },

  // ── sendTypingIndicator ────────────────────────────────────────────────────
  sendTypingIndicator: async (diagnosisId, isTyping) => {
    try {
      await IMService.sendTypingIndicator(diagnosisId, isTyping);
    } catch (err) {
      // Silently fail for typing indicators; they're low-priority
      console.warn('Failed to send typing indicator:', err);
    }
  },
}));
