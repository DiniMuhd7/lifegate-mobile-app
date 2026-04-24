import { create } from 'zustand';
import { IMMessage, IMConversation } from '../types/im-types';
import { IMService } from '../services/im-service';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface IMState {
  /** One conversation slot per diagnosed case (keyed by diagnosisId) */
  conversations: Record<string, IMConversation>;

  /** Load (or refresh) a conversation. Marks incoming messages as read. */
  loadConversation: (diagnosisId: string) => Promise<void>;

  /** Optimistically append a sent message, then confirm with the server. */
  sendMessage: (diagnosisId: string, content: string) => Promise<void>;

  /** Apply a real-time inbound message received via WebSocket. */
  receiveMessage: (msg: IMMessage) => void;

  /** Apply a real-time read-receipt (marks all prior messages as read). */
  receiveReadReceipt: (diagnosisId: string) => void;

  /** Reset a single conversation's error state. */
  clearError: (diagnosisId: string) => void;
}

// ─── Default conversation factory ────────────────────────────────────────────

function emptyConversation(diagnosisId: string): IMConversation {
  return {
    diagnosisId,
    messages: [],
    unreadCount: 0,
    loading: false,
    sending: false,
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function patchConversation(
  conversations: Record<string, IMConversation>,
  diagnosisId: string,
  patch: Partial<IMConversation>,
): Record<string, IMConversation> {
  const existing = conversations[diagnosisId] ?? emptyConversation(diagnosisId);
  return { ...conversations, [diagnosisId]: { ...existing, ...patch } };
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
  sendMessage: async (diagnosisId, content) => {
    const tempId = `optimistic-${Date.now()}`;
    const optimistic: IMMessage = {
      id: tempId,
      diagnosis_id: diagnosisId,
      sender_id: 'me',
      sender_role: 'user', // replaced by server response
      sender_name: '',
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
      // Remove the optimistic entry on failure
      set((s) => {
        const conv = s.conversations[diagnosisId] ?? emptyConversation(diagnosisId);
        return {
          conversations: patchConversation(s.conversations, diagnosisId, {
            messages: conv.messages.filter((m) => m.id !== tempId),
            sending: false,
            error: message,
          }),
        };
      });
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
      if (!conv) return s;
      const now = new Date().toISOString();
      return {
        conversations: patchConversation(s.conversations, diagnosisId, {
          messages: conv.messages.map((m) =>
            m.read_at ? m : { ...m, read_at: now },
          ),
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
}));
