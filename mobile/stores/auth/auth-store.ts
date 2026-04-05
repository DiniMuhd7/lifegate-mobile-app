// ============================================================
// AUTH STORE (ZUSTAND)
// Manages: login, logout, authenticated user state, session restoration
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { User } from 'types/auth-types';
import { getToken, removeToken, saveToken } from 'utils/tokenStorage';
import { extractErrorMessage } from 'utils/error-utils';

type AuthState = {
  // Authenticated user
  user: User | null;
  isAuthenticated: boolean;

  // Pending physician 2FA session (set when login returns requires2FA: true)
  pending2FA: { email: string; rememberMe: boolean } | null;

  // Login draft (separate from registration)
  loginDraft: {
    email: string;
    password: string;
  };

  // UI state
  loading: boolean;
  error: string | null;

  // Actions
  setLoginField: (field: 'email' | 'password', value: string) => void;
  clearLoginDraft: () => void;
  login: (email: string, password: string, remember: boolean) => Promise<boolean>;
  verifyPhysician2FA: (email: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
  markMdcnVerified: () => Promise<boolean>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  // -------- State --------
  user: null,
  isAuthenticated: false,
  pending2FA: null,
  loginDraft: {
    email: '',
    password: '',
  },
  loading: false,
  error: null,

  // -------- Actions --------

  // Update login draft field
  setLoginField: (field, value) =>
    set((state) => ({
      loginDraft: { ...state.loginDraft, [field]: value },
    })),

  // Clear login draft
  clearLoginDraft: () =>
    set({
      loginDraft: { email: '', password: '' },
    }),

  // Clear any error
  clearError: () => set({ error: null }),

  // Restore session from secure storage and token
  restoreSession: async () => {
    try {
      const token = await getToken();
      if (token) {
        // Fetch user profile to restore user data
        const response = await AuthService.getProfile();
        if (response.success && response.user) {
          set({
            user: response.user,
            isAuthenticated: true,
          });
        } else {
          // Token exists but profile fetch failed (expired / revoked) — purge it
          await removeToken();
          set({ isAuthenticated: false, user: null });
        }
      } else {
        set({ isAuthenticated: false });
      }
    } catch {
      await removeToken();
      set({ isAuthenticated: false, user: null });
    }
  },

  // -------- LOGIN --------
  login: async (email, password, rememberMe) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.login({ email, password });

      if (!response.success) {
        set({ loading: false, error: response.message ?? 'Login failed' });
        return false;
      }

      // Physician requires a second factor — store pending session and signal the screen.
      if (response.requires2FA) {
        set({ loading: false, error: null, pending2FA: { email: response.email!, rememberMe } });
        return true;
      }

      if (!response.user) {
        set({ loading: false, error: 'Login failed' });
        return false;
      }

      if (rememberMe && response.token) {
        await saveToken(response.token);
      }

      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
        pending2FA: null,
      });
      return true;
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(err),
      });
      return false;
    }
  },

  // -------- PHYSICIAN 2FA VERIFY --------
  verifyPhysician2FA: async (email, otp) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.verifyPhysician2FA(email, otp);
      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Verification failed' });
        return false;
      }
      if (response.token) {
        await saveToken(response.token);
      }
      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
        pending2FA: null,
      });
      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- LOGOUT --------
  logout: async () => {
    await removeToken();
    // Clear auth state
    set({
      user: null,
      isAuthenticated: false,
      error: null,
      pending2FA: null,
    });
    // Clear dependent stores so stale data doesn't bleed into the next session
    try {
      const { useSessionStore } = await import('../session-store');
      useSessionStore.setState({
        sessions: [],
        incompleteSession: null,
        activeServerSessionId: null,
      });
    } catch { /* best-effort */ }
    try {
      const { useChatStore } = await import('../chat-store');
      useChatStore.setState({
        conversations: [],
        activeConversationId: null,
        userId: null,
      });
    } catch { /* best-effort */ }
  },

  // -------- MDCN VERIFICATION --------
  markMdcnVerified: async () => {
    try {
      const response = await AuthService.confirmMdcnVerification();
      if (!response.success) return false;
      if (response.user) {
        set((state) => ({ user: { ...state.user!, ...response.user } }));
      } else {
        // Optimistically flip the flag if the backend didn't return the full user
        set((state) => ({
          user: state.user ? { ...state.user, mdcn_verified: true } : state.user,
        }));
      }
      return true;
    } catch {
      return false;
    }
  },
}));
