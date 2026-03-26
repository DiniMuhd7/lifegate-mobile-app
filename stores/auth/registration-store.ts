// ============================================================
// REGISTRATION STORE (ZUSTAND)
// Manages: new registration flow (two-stage), form draft, and OTP verification
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { UserDraft } from 'types/auth-types';
import { validateRegistration, hasErrors } from 'utils/validation';
import { extractErrorMessage } from 'utils/error-utils';
import { useAuthStore } from './auth-store';

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
  setCertificateFile: (file: File | null) => void;
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
  certificateName: '',
  certificateId: '',
  certificateIssueDate: '',
  yearsOfExperience: '',
  certificate: null,
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

  // Set certificate file for professional registration
  setCertificateFile: (file) =>
    set((state) => ({
      userDraft: { ...state.userDraft, certificate: file },
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
      certificateName,
      certificateId,
      certificateIssueDate,
      yearsOfExperience,
      certificate,
    } = formData;

    try {
      // Build FormData for multipart/form-data request
      const payload = new FormData();
      payload.append('name', name);
      payload.append('email', email);
      payload.append('password', password);
      payload.append('role', role);
      payload.append('phone', phone);
      payload.append('dob', dob);
      payload.append('gender', gender.toLowerCase());
      payload.append('language', language.toLowerCase());
      if (healthHistory) {
        payload.append('healthHistory', healthHistory);
      }
      // Add professional-specific fields
      if (role === 'professional') {
        if (specialization) payload.append('specialization', specialization);
        if (certificateName) payload.append('certificateName', certificateName);
        if (certificateId) payload.append('certificateId', certificateId);
        if (certificateIssueDate) payload.append('certificateIssueDate', certificateIssueDate);
        if (yearsOfExperience) payload.append('yearsOfExperience', yearsOfExperience);
        if (certificate) {
          payload.append('certificate', {
            uri: certificate.uri,
            name: certificate.name,
            type: certificate.type,
          } as any);
        }
      }
      console.log(
        certificate ? 'Certificate file included in payload:' : 'No certificate file included'
      );
      console.log('Starting registration with FormData payload for role:', role);
      const response = await AuthService.startRegistration(payload);

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
        const errorMessage = extractErrorMessage({
          response: { data: { message: response.message } },
        });
        console.error('OTP verification failed:', errorMessage);

        // Instead of directly using errorMessage, ensure it's a string
        if (errorMessage.toLowerCase().includes('expired')) {
          set({ loading: false, error: 'OTP expired. Please request a new code.' });
        } else if (errorMessage.toLowerCase().includes('invalid')) {
          set({ loading: false, error: 'Invalid verification code' });
        } else if (errorMessage.toLowerCase().includes('already')) {
          set({ loading: false, error: 'Email already registered' });
        } else {
          set({ loading: false, error: errorMessage });
        }
        return false;
      }
      console.log('OTP verification response:', response);
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
      console.error('OTP verification error:', extractErrorMessage(err));
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
