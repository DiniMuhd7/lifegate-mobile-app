// ============================================================
// AUTH STORE (ZUSTAND)
// Handles authentication state and talks to AuthService.
// Screens (Login/Register) only call store actions.
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from 'services/auth-service';
import { AuthUser , UserDraft , HealthProfessionalDraft, HealthProfessionalUser, HealthProfessionalLoginResponse } from 'types/auth-types';
import { router } from 'expo-router';


// ---------------------------
// Type describing the form data shared by Login & Register
// ---------------------------



// ---------------------------
// What the store exposes
// ---------------------------
type AuthState = {
  // form state
  userDraft: UserDraft;
  healthProfessionalDraft: HealthProfessionalDraft;

  // authenticated user
  user: AuthUser | null;
  healthProfessionalUser: HealthProfessionalUser | null;
  isAuthenticated: boolean;
  userRole: 'user' | 'health_professional' | null; // track current user type

  // UI state
  loading: boolean;
  error: string | null;

  // actions
  setUserField: (field: keyof UserDraft, value: string) => void;
  setHealthProfessionalField: (field: keyof HealthProfessionalDraft, value: string) => void;
  resetForm: () => void;
  UserLogin: (email: string, password: string) => Promise<boolean>;
  UserLogout: () => Promise<void>;
  clearError: () => void;
  UserRegister: () => Promise<void>;
  HealthProfessionalLogin: (email: string, password: string) => Promise<boolean>;
  HealthProfessionalRegister: () => Promise<void>;
  HealthProfessionalLogout: () => Promise<void>;
  restoreSession: () => Promise<void>; // Restore user session from async storage
};

// ---------------------------
// Initial empty form values
// ---------------------------
const emptyDraft: UserDraft = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  phone: '', // profile details (step 2 of registration)
  dob: '',
  gender: '',
  language: '',
  healthHistory: '', // profile details (step 2 of registration)
};


const emptyHealthProfessionalDraft: HealthProfessionalDraft = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  phone: '',
  dob: '',
  gender: '',
  language: '',
  healthHistory: '',
  specialization: '',
  licenseNumber: '',
  certificateName: '',
  certificateId: '',
  yearsOfExperience: '',
}

// ---------------------------
// Creating the store
// ---------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  // ---------------- state ----------------
  userDraft: emptyDraft,
  healthProfessionalDraft: emptyHealthProfessionalDraft,
  user: null,
  healthProfessionalUser: null,
  isAuthenticated: false,
  userRole: null,
  loading: false,
  error: null,

  // ---------------- actions ----------------

  // update any field in the form
  setUserField: (field, value) =>
    set((state) => ({
      userDraft: { ...state.userDraft, [field]: value },
    })),


  setHealthProfessionalField: (field, value) =>
    set((state) => ({
      healthProfessionalDraft: { ...state.healthProfessionalDraft, [field]: value },
    })),

  // reset form to initial state
  resetForm: () => set({ userDraft: emptyDraft, healthProfessionalDraft: emptyHealthProfessionalDraft }),

  // clear any error
  clearError: () => set({ error: null }),

  // Restore session from async storage
  restoreSession: async () => {
    try {
      const storedSession = await AuthService.getStoredUser();
      if (storedSession) {
        const { user, userRole } = storedSession;
        if (userRole === 'health_professional') {
          set({
            healthProfessionalUser: user,
            isAuthenticated: true,
            userRole,
          });
        } else {
          set({
            user,
            isAuthenticated: true,
            userRole,
          });
        }
        console.log('Session restored from async storage');
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
    }
  },

  // ---------------- LOGIN ----------------
  UserLogin: async (email, password) => {
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
      router.push('/(tab)/homescreen');
      return true;
    } catch (err) {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
      return false;
    }
  },

  // ---------------- LOGOUT ----------------
  UserLogout: async () => {
    await AuthService.clearUserFromStorage();
    set({
      user: null,
      healthProfessionalUser: null,
      isAuthenticated: false,
      userRole: null,
      error: null,
      userDraft: emptyDraft,
      healthProfessionalDraft: emptyHealthProfessionalDraft,
    });
    console.log('User logged out');
  },

  // ---------------- REGISTER ----------------
  UserRegister: async () => {
    const { name, email, password, confirm, phone, dob, gender, language, healthHistory } =
      get().userDraft;

    // client-side validation
    if (
      !name ||
      !email ||
      !password ||
      !confirm ||
      !phone ||
      !dob ||
      !gender ||
      !language ||
      !healthHistory
    ) {
      set({ error: 'All fields are required' });
      return;
    }
    if (password !== confirm) {
      set({ error: 'Passwords do not match' });
      return;
    }
    set({ loading: true, error: null });
    try {
      // call AuthService.register
      const response = await AuthService.register({
        name,
        email,
        password,
        phone,
        dob,
        gender,
        language,
        healthHistory,
      });

      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Registration failed' });
        return;
      }
      // registration successful → set user session
      set({
        user: response.user,
        isAuthenticated: true,
        loading: false,
      });
      // Reset form after successful registration
      get().resetForm();
    } catch (err) {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
    }
  },

  // ============ HEALTH PROFESSIONAL LOGIN ============
  HealthProfessionalLogin: async (email, password) => {
    set({ loading: true, error: null });

    try {
      const response = await AuthService.healthProfessionalLogin({ email, password });

      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Login failed' });
        return false;
      }

      set({
        healthProfessionalUser: response.user,
        isAuthenticated: true,
        userRole: 'health_professional',
        loading: false,
      });

      console.log('Health Professional logged in successfully');
      console.log('Health Professional logged in successfully: ', response.user);
      router.push('/(tab)/homescreen');
      return true;
    } catch (err) {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
      return false;
    }
  },

  // ============ HEALTH PROFESSIONAL REGISTER ============
  HealthProfessionalRegister: async () => {
    const {
      name,
      email,
      password,
      confirm,
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
    } = get().healthProfessionalDraft;

    // client-side validation
    if (
      !name ||
      !email ||
      !password ||
      !confirm ||
      !phone ||
      !dob ||
      !gender ||
      !language ||
      !healthHistory ||
      !specialization ||
      !licenseNumber ||
      !certificateName ||
      !certificateId
    ) {
      set({ error: 'All fields are required' });
      return;
    }
    if (password !== confirm) {
      set({ error: 'Passwords do not match' });
      return;
    }
    set({ loading: true, error: null });
    try {
      // call AuthService.healthProfessionalRegister
      const response = await AuthService.healthProfessionalRegister({
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
      });

      if (!response.success || !response.user) {
        set({ loading: false, error: response.message ?? 'Registration failed' });
        return;
      }
      // registration successful → set health professional session
      set({
        healthProfessionalUser: response.user,
        isAuthenticated: true,
        userRole: 'health_professional',
        loading: false,
      });
      // Reset form after successful registration
      get().resetForm();
    } catch (err) {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
    }
  },

  // ============ HEALTH PROFESSIONAL LOGOUT ============
  HealthProfessionalLogout: async () => {
    await AuthService.clearUserFromStorage();
    set({
      healthProfessionalUser: null,
      user: null,
      isAuthenticated: false,
      userRole: null,
      error: null,
      userDraft: emptyDraft,
      healthProfessionalDraft: emptyHealthProfessionalDraft,
    });
    console.log('Health Professional logged out');
  },
}));
