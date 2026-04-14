// ============================================================
// AUTH STORE (ZUSTAND)
// Manages: login, logout, authenticated user state, session restoration
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { User } from 'types/auth-types';
import { getRefreshToken, removeRefreshToken, removeToken, saveRefreshToken } from 'utils/tokenStorage';
import { setAccessToken } from 'services/api';
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

  // Session restore state — true while restoreSession is in-flight,
  // false once it has settled (success or failure). Used to prevent
  // protected screens from flashing unauthenticated content on web refresh.
  sessionLoading: boolean;

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
  sessionLoading: false,

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
    // Prevent concurrent or duplicate calls.
    if (get().sessionLoading) return;
    set({ sessionLoading: true });
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        // Exchange refresh token for a fresh access token.
        const result = await AuthService.refresh(refreshToken);
        if (result.success && result.token && result.user) {
          setAccessToken(result.token);
          if (result.refreshToken) {
            await saveRefreshToken(result.refreshToken);
          }
          set({ user: result.user, isAuthenticated: true, sessionLoading: false });
        } else {
          // Refresh token is invalid or revoked — clear everything.
          await removeRefreshToken();
          setAccessToken(null);
          set({ isAuthenticated: false, user: null, sessionLoading: false });
        }
      } else {
        set({ isAuthenticated: false, sessionLoading: false });
      }
    } catch {
      await removeRefreshToken();
      setAccessToken(null);
      set({ isAuthenticated: false, user: null, sessionLoading: false });
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

      // Access token lives only in memory; refresh token is persisted securely.
      if (response.token) {
        setAccessToken(response.token);
      }
      if (response.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }

      // Clear any previous user's health data before applying the new user's state.
      try {
        const { useHealthStore } = await import('../health-store');
        useHealthStore.getState().reset();
      } catch { /* best-effort */ }

      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
        pending2FA: null,
      });

      // Mirror the app-boot behaviour: load any abandoned session for patients
      // so the ResumeSessionModal is offered after a mid-session user switch.
      if (response.user.role === 'user') {
        import('../session-store')
          .then(({ useSessionStore }) => useSessionStore.getState().fetchIncomplete())
          .catch(() => {});
      }

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
        setAccessToken(response.token);
      }
      if (response.refreshToken) {
        await saveRefreshToken(response.refreshToken);
      }
      // Clear any previous user's health data before applying the new user's state.
      try {
        const { useHealthStore } = await import('../health-store');
        useHealthStore.getState().reset();
      } catch { /* best-effort */ }

      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
        pending2FA: null,
      });

      // Same as direct login: offer resume modal for patients on user switch.
      if (response.user.role === 'user') {
        import('../session-store')
          .then(({ useSessionStore }) => useSessionStore.getState().fetchIncomplete())
          .catch(() => {});
      }

      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- LOGOUT --------
  logout: async () => {
    // Revoke refresh token server-side (best-effort).
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }
    } catch { /* best-effort */ }

    // Clear in-memory access token and persisted refresh token.
    setAccessToken(null);
    await removeToken().catch(() => {});
    await removeRefreshToken().catch(() => {});

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
      useChatStore.getState().resetChatState();
    } catch { /* best-effort */ }
    try {
      const { useHealthStore } = await import('../health-store');
      useHealthStore.getState().reset();
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
