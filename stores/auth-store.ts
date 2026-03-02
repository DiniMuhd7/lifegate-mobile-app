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

  // Actions
  setUserField: (field: keyof UserDraft, value: string) => void;
  resetForm: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (role: 'user' | 'professional') => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  restoreSession: () => Promise<void>;
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
      });
      router.push('/(tab)/chatScreen');
      return true;
    } catch {
      set({
        loading: false,
        error: 'Network error. Please try again.',
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
      });

      // Reset form after successful registration
      get().resetForm();
      router.push('/(auth)/login');
    } catch {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
      Alert.alert('Registration Error', 'Network error. Please try again.');
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
    });
    console.log('User logged out');
  },
}));
