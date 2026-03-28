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
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  // -------- State --------
  user: null,
  isAuthenticated: false,
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
          // Token exists but profile fetch failed
          set({
            isAuthenticated: false,
            user: null,
          });
        }
      } else {
        set({
          isAuthenticated: false,
        });
      }
    } catch {
      set({ isAuthenticated: false, user: null });
    }
  },

  // -------- LOGIN --------
  login: async (email, password, rememberMe) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.login({ email, password });
      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Login failed' });
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

  // -------- LOGOUT --------
  logout: async () => {
    await removeToken();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },
}));
