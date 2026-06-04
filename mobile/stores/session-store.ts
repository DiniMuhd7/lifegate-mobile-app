/**
 * Session Store (Zustand)
 * Manages server-side chat session state including:
 * - Session CRUD (synced with /api/sessions endpoints)
 * - Incomplete/abandoned session detection for the resume prompt
 * - Tracking the active server session ID for background-sync
 */

import { create } from 'zustand';
import type { ServerSession, CreateSessionInput, UpdateSessionInput } from 'types/chat-types';
import { SessionService } from 'services/session-service';

type SessionState = {
  /** Full list of server sessions for the authenticated user. */
  sessions: ServerSession[];

  /**
   * The most recent abandoned session found on startup.
   * Non-null triggers the ResumeSessionModal.
   */
  incompleteSession: ServerSession | null;

  /**
   * ID of the server session currently being synced with the active local
   * conversation. Set when a session is created or resumed; cleared on delete.
   */
  activeServerSessionId: string | null;

  isLoading: boolean;
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Load all sessions from the server. */
  fetchSessions: () => Promise<void>;

  /**
   * Check the server for an abandoned session from the last 24 hours.
   * Populates incompleteSession if found; no-op on network failure.
   */
  fetchIncomplete: () => Promise<void>;

  /** Create a new server session and prepend it to the local list. */
  createSession: (input: CreateSessionInput) => Promise<ServerSession | null>;

  /**
   * Patch an existing server session. Also manages the Redis abandoned-session
   * cache via the status field:
   *   abandoned → saves to Redis for 24 h fast lookup
   *   active | completed → clears Redis entry
   */
  updateSession: (id: string, input: UpdateSessionInput) => Promise<ServerSession | null>;

  /** Permanently delete a session. */
  deleteSession: (id: string) => Promise<void>;

  /** Set the server session ID being synced with the current local conversation. */
  setActiveServerSessionId: (id: string | null) => void;

  /**
   * Dismiss the resume prompt without resuming (e.g. "Start Fresh").
   * Marks the incomplete session as completed on the server so it won't reappear.
   */
  dismissIncomplete: () => Promise<void>;

  clearError: () => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  incompleteSession: null,
  activeServerSessionId: null,
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await SessionService.list();
      set({ sessions, isLoading: false });
    } catch {
      set({ error: 'Failed to load sessions', isLoading: false });
    }
  },

  fetchIncomplete: async () => {
    try {
      const session = await SessionService.getIncomplete();
      set({ incompleteSession: session });
    } catch {
      // Non-blocking — a missing session is not a fatal error.
    }
  },

  createSession: async (input) => {
    try {
      const session = await SessionService.create(input);
      set((state) => ({ sessions: [session, ...state.sessions] }));
      return session;
    } catch {
      return null;
    }
  },

  updateSession: async (id, input) => {
    try {
      const updated = await SessionService.update(id, input);
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? updated : s)),
        incompleteSession:
          state.incompleteSession?.id === id ? updated : state.incompleteSession,
      }));
      return updated;
    } catch {
      return null;
    }
  },

  deleteSession: async (id) => {
    try {
      await SessionService.delete(id);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        incompleteSession:
          state.incompleteSession?.id === id ? null : state.incompleteSession,
        activeServerSessionId:
          state.activeServerSessionId === id ? null : state.activeServerSessionId,
      }));
    } catch {
      // Silently handle — caller can optimistically remove from UI if needed.
    }
  },

  setActiveServerSessionId: (id) => {
    set({ activeServerSessionId: id });
  },

  dismissIncomplete: async () => {
    const { incompleteSession, updateSession } = get();
    if (incompleteSession) {
      // Mark completed on server so it won't reappear on next launch.
      await updateSession(incompleteSession.id, { status: 'completed' });
    }
    set({ incompleteSession: null });
  },

  clearError: () => set({ error: null }),
}));
