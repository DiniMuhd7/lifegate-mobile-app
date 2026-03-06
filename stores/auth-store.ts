// ============================================================
// AUTH STORE (ZUSTAND)
// Handles authentication state with a single centralized user.
// Screens only call store actions.
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { User, UserDraft } from 'types/auth-types';
import { router } from 'expo-router';
import { getToken, removeToken } from 'utils/tokenStorage';
import { validateRegistration, hasErrors } from 'utils/validation';
import { Alert } from 'react-native';


// ---------------------------
// What the store exposes
// ---------------------------
type AuthState = {
  // Form state - single centralized draft
  userDraft: UserDraft;

  // Authenticated user (single field - role is in user.role)
  user: User | null;
  isAuthenticated: boolean;

  // UI state
  loading: boolean;
  error: string | null;

  // Password Recovery state
  passwordRecoveryEmail: string | null;
  signupOtpEmail: string | null;

  // Actions
  setUserField: (field: keyof UserDraft, value: string) => void;
  resetForm: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (role: 'user' | 'professional') => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  restoreSession: () => Promise<void>;
  setPasswordRecoveryEmail: (email: string) => void;
  clearPasswordRecoveryState: () => void;
  setSignupOtpEmail: (email: string | null) => void;
  // Password recovery actions
  sendOtpForPasswordRecovery: (email: string) => Promise<boolean>;
  verifyOtpForPasswordRecovery: (email: string, otp: string) => Promise<boolean>;
  resetPassword: (email: string, newPassword: string, otp: string) => Promise<boolean>;
  // Signup OTP actions
  sendOtpForSignup: (email: string) => Promise<boolean>;
  verifyOtpForSignup: (email: string, otp: string) => Promise<boolean>;
  resendOtp: (email: string, type: 'password-reset' | 'signup') => Promise<boolean>;
};

// ---------------------------
// Initial empty form values
// ---------------------------
const emptyDraft: UserDraft = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  dob: '',
  gender: '',
  language: '',
  healthHistory: '',
  role: undefined,
  specialization: '',
  licenseNumber: '',
  certificateName: '',
  certificateId: '',
  certificateIssueDate: '',
  yearsOfExperience: '',
};

// ---------------------------
// Creating the store
// ---------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  // -------- State --------
  userDraft: emptyDraft,
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  passwordRecoveryEmail: null,
  signupOtpEmail: null,

  // -------- Actions --------

  // Update any field in the form
  setUserField: (field, value) =>
    set((state) => ({
      userDraft: { ...state.userDraft, [field]: value },
    })),

  // Reset form to initial state
  resetForm: () => set({ userDraft: emptyDraft }),

  // Clear any error
  clearError: () => set({ error: null }),

  // Restore session from secure storage and token
  restoreSession: async () => {
    try {
      const token = await getToken();
      if (token) {
        console.log('Token found - user session valid');
        set({
          isAuthenticated: true,
        });
      } else {
        console.log('No token found - user needs to login');
        set({
          isAuthenticated: false,
        });
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      set({ isAuthenticated: false });
    }
  },

  // -------- LOGIN --------
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.login({ email, password });
      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Login failed' });
        return false;
      }

      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      const message = err.message || 'Network error. Please try again.';
      set({
        loading: false,
        error: message,
      });
      return false;
    }
  },

  // -------- REGISTER --------
  register: async (role: 'user' | 'professional') => {
    set({ loading: true, error: null });
    const formData = get().userDraft;

    // Comprehensive validation
    const validationErrors = validateRegistration(formData, role);
    if (hasErrors(validationErrors)) {
      const errorMessages = validationErrors.map((err) => err.message).join('\n');
      set({ loading: false, error: errorMessages });
      Alert.alert('Validation Error', errorMessages);
      return;
    }

    const {
      name,
      email,
      password,
      confirmPassword,
      phone,
      dob,
      gender,
      language,
      healthHistory,
      specialization,
      licenseNumber,
      certificateName,
      certificateId,
      certificateIssueDate,
      yearsOfExperience,
    } = formData;

    try {
      const registerPayload = {
        name,
        email,
        password,
        confirmPassword,
        phone,
        dob,
        gender,
        language,
        healthHistory,
        role,
        ...(role === 'professional' && {
          specialization,
          licenseNumber,
          certificateName,
          certificateId,
          certificateIssueDate,
          yearsOfExperience,
        }),
      };
      console.log('Registering with payload:', registerPayload);
      const response = await AuthService.register(registerPayload);
      
      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Registration failed' });
        return;
      }

      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
        error: null,
      });

      // Reset form after successful registration
      get().resetForm();
      // router.push('/(auth)/login');
    } catch (err: any) {
      const message = err.message || 'Network error. Please try again.';
      set({
        loading: false,
        error: message,
      });
    }
  },

  // -------- LOGOUT --------
  logout: async () => {
    await removeToken();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
      userDraft: emptyDraft,
      passwordRecoveryEmail: null,
      signupOtpEmail: null,
    });
    console.log('User logged out');
  },

  // -------- PASSWORD RECOVERY --------
  setPasswordRecoveryEmail: (email: string) =>
    set({ passwordRecoveryEmail: email }),

  clearPasswordRecoveryState: () =>
    set({ passwordRecoveryEmail: null, error: null }),

  // -------- SIGNUP OTP --------
  setSignupOtpEmail: (email: string | null) =>
    set({ signupOtpEmail: email }),

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
        error: null 
      });
      console.log('OTP sent for password recovery');
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to send OTP';
      set({ loading: false, error: message });
      return false;
    }
  },

  // -------- PASSWORD RECOVERY: VERIFY OTP --------
  verifyOtpForPasswordRecovery: async (email: string, otp: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.verifyOtpForPasswordRecovery(email, otp);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({ loading: false, error: null });
      console.log('OTP verified for password recovery');
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to verify OTP';
      set({ loading: false, error: message });
      return false;
    }
  },

  // -------- PASSWORD RECOVERY: RESET PASSWORD --------
  resetPassword: async (email: string, newPassword: string, otp: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.resetPassword(email, newPassword, otp);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({ 
        loading: false, 
        error: null, 
        passwordRecoveryEmail: null 
      });
      console.log('Password reset successfully');
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to reset password';
      set({ loading: false, error: message });
      return false;
    }
  },

  // -------- SIGNUP: SEND OTP --------
  sendOtpForSignup: async (email: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.sendOtpForSignup(email);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({ 
        signupOtpEmail: email, 
        loading: false, 
        error: null 
      });
      console.log('OTP sent for signup');
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to send verification code';
      set({ loading: false, error: message });
      return false;
    }
  },

  // -------- SIGNUP: VERIFY OTP --------
  verifyOtpForSignup: async (email: string, otp: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.verifyOtpForSignup(email, otp);
      if (!response.success) {
        set({ loading: false, error: response.message });
        return false;
      }
      set({ loading: false, error: null });
      console.log('OTP verified for signup');
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to verify email';
      set({ loading: false, error: message });
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
      console.log(`Code resent for ${type}`);
      return true;
    } catch (err: any) {
      const message = err.message || 'Failed to resend code';
      set({ loading: false, error: message });
      return false;
    }
  },
}));
