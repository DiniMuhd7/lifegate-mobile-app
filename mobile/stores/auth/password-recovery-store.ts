// ============================================================
// PASSWORD RECOVERY STORE (ZUSTAND)
// Manages: password recovery flow (send OTP, verify, reset)
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { extractErrorMessage } from 'utils/error-utils';

type PasswordRecoveryState = {
  // Password recovery state
  passwordRecoveryEmail: string | null;
  resetToken: string | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions
  setPasswordRecoveryEmail: (email: string) => void;
  clearPasswordRecoveryState: () => void;
  clearError: () => void;
  sendOtpForPasswordRecovery: (email: string) => Promise<boolean>;
  verifyOtpForPasswordRecovery: (email: string, code: string) => Promise<boolean>;
  resetPassword: (token: string, newPassword: string) => Promise<boolean>;
  resendOtp: (email: string, type: 'password-reset' | 'signup') => Promise<boolean>;
};

export const usePasswordRecoveryStore = create<PasswordRecoveryState>((set) => ({
  // -------- State --------
  passwordRecoveryEmail: null,
  resetToken: null,
  loading: false,
  error: null,

  // -------- Actions --------

  // Clear any error
  clearError: () => set({ error: null }),

  // Set password recovery email
  setPasswordRecoveryEmail: (email: string) =>
    set({ passwordRecoveryEmail: email }),

  // Clear all password recovery state
  clearPasswordRecoveryState: () =>
    set({ passwordRecoveryEmail: null, error: null }),

  // -------- PASSWORD RECOVERY: SEND OTP --------
  sendOtpForPasswordRecovery: async (email: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.sendOtpForPasswordRecovery(email);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({
        passwordRecoveryEmail: email,
        loading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- PASSWORD RECOVERY: VERIFY OTP --------
  verifyOtpForPasswordRecovery: async (email: string, code: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.verifyOtpForPasswordRecovery(email, code);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }

      // Store the resetToken from the response
      set({
        resetToken: response.data.resetToken,
        loading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- PASSWORD RECOVERY: RESET PASSWORD --------
  resetPassword: async (token: string, newPassword: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.resetPassword(token, newPassword);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }

      // Clear resetToken and passwordRecoveryEmail on successful password reset
      set({
        loading: false,
        error: null,
        resetToken: null,
        passwordRecoveryEmail: null,
      });
      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- OTP: RESEND --------
  resendOtp: async (email: string, type: 'password-reset' | 'signup') => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.resendOtp(email, type);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({ loading: false, error: null });
      return true;
    } catch (err: unknown) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
}));
