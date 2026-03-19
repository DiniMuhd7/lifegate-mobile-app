// ============================================================
// REGISTRATION STORE (ZUSTAND)
// Manages: new registration flow (two-stage), form draft, and OTP verification
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { UserDraft } from 'types/auth-types';
import { validateRegistration, hasErrors } from 'utils/validation';
import { extractErrorMessage } from 'utils/error-utils';
import { Alert } from 'react-native';

type RegistrationState = {
  // Form state
  userDraft: UserDraft;

  // Registration flow state
  pendingRegistrationEmail: string | null;
  otpExpiresIn: number | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions
  setUserField: (field: keyof UserDraft, value: string) => void;
  resetForm: () => void;
  clearError: () => void;
  startRegistration: (role: 'user' | 'professional') => Promise<boolean>;
  verifyRegistration: (email: string, otp: string) => Promise<boolean>;
  resendRegistrationOTP: (email: string) => Promise<boolean>;
};

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

export const useRegistrationStore = create<RegistrationState>((set, get) => ({
  // -------- State --------
  userDraft: emptyDraft,
  pendingRegistrationEmail: null,
  otpExpiresIn: null,
  loading: false,
  error: null,

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

  // -------- REGISTRATION FLOW: STAGE 1 --------
  startRegistration: async (role: 'user' | 'professional') => {
    set({ loading: true, error: null });
    const formData = get().userDraft;

    // Comprehensive validation
    const validationErrors = validateRegistration(formData, role);
    if (hasErrors(validationErrors)) {
      const errorMessages = validationErrors.map((err) => err.message).join('\n');
      set({ loading: false, error: errorMessages });
      return false;
    }

    const {
      name,
      email,
      password,
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
      const registrationPayload = {
        name,
        email,
        password,
        role,
        phone,
        dob,
        gender: gender.toLowerCase(),
        language: language.toLowerCase(),
        healthHistory,
        ...(role === 'professional' && {
          specialization,
          licenseNumber,
          certificateName,
          certificateId,
          certificateIssueDate,
          yearsOfExperience,
        }),
      };

      console.log('Starting registration with payload:', registrationPayload);
      const response = await AuthService.startRegistration(registrationPayload);

      if (!response.success || !response.data) {
        set({ loading: false, error: response.message ?? 'Failed to start registration' });
        console.error('Registration start failed:', response.message);
        return false;
      }

      // Store email and OTP expiration, clear password from memory
      set({
        pendingRegistrationEmail: email,
        otpExpiresIn: response.data.otpExpiresIn,
        userDraft: { ...formData, password: '', confirmPassword: '' }, // Clear password
        loading: false,
        error: null,
      });

      console.log('Registration started - OTP sent to email, password cleared from state');
      return true;
    } catch (err: any) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- REGISTRATION FLOW: STAGE 2 - VERIFY OTP --------
  verifyRegistration: async (email: string, otp: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.verifyRegistration({ email, otp });

      if (!response.success || !response.data) {
        const errorMessage = response.message;

        if (errorMessage?.includes('expired')) {
          set({ loading: false, error: 'OTP expired. Please request a new code.' });
        } else if (errorMessage?.includes('Invalid')) {
          set({ loading: false, error: 'Invalid verification code' });
        } else if (errorMessage?.includes('already')) {
          set({ loading: false, error: 'Email already registered' });
        } else {
          set({ loading: false, error: errorMessage ?? 'Verification failed' });
        }
        return false;
      }

      // Clear registration state after successful verification
      // User is now logged in via AuthService, but this store clears its own state
      set({
        pendingRegistrationEmail: null,
        otpExpiresIn: null,
        userDraft: emptyDraft, // Clear form after successful registration
        loading: false,
        error: null,
      });

      console.log('Registration verified');
      return true;
    } catch (err: any) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- REGISTRATION FLOW: RESEND OTP --------
  resendRegistrationOTP: async (email: string) => {
    set({ loading: true, error: null });
    try {
      const response = await AuthService.resendRegistrationOTP(email);

      if (!response.success || !response.data) {
        set({ loading: false, error: response.message ?? 'Failed to resend code' });
        return false;
      }

      // Update OTP expiration timer
      set({
        otpExpiresIn: response.data.otpExpiresIn,
        loading: false,
        error: null,
      });

      console.log('Registration OTP resent successfully');
      return true;
    } catch (err: any) {
      set({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
}));
