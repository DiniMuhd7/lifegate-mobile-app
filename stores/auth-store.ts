// ============================================================
// AUTH STORE (ZUSTAND)
// Handles authentication state and talks to AuthService.
// Screens (Login/Register) only call store actions.
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { AuthUser , UserDraft , HealthProfessionalDraft, HealthProfessionalUser } from 'types/auth-types';
import { router } from 'expo-router';
import { getToken, removeToken } from 'utils/tokenStorage';


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

  // authenticated user (single field - role is in user.role)
  user: AuthUser | HealthProfessionalUser | null;
  isAuthenticated: boolean;

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
  restoreSession: () => Promise<void>;
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
  isAuthenticated: false,
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

  // Restore session from secure storage and token
  restoreSession: async () => {
    try {
      const token = await getToken();
      if (token) {
        // Token exists - user is authenticated
        // In a real app, you might call a /auth/me endpoint to get current user data
        // For now, we trust the token and mark as authenticated
        // The next protected API call will validate the token via 401 check
        console.log('Token found - user session valid');
        set({
          isAuthenticated: true,
          // User data could be fetched here from /auth/me endpoint if needed
        });
      } else {
        // No token - user not authenticated
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
    } catch {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
      return false;
    }
  },

  // ---------------- LOGOUT ----------------
  UserLogout: async () => {
    await removeToken();
    set({
      user: null,
      isAuthenticated: false,
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
        role: 'user',
        gender,
        language,
        healthHistory,
      });
      console.log('Registration response:', response);

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
    } catch {
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
        user: response.user,
        isAuthenticated: true,
        loading: false,
      });

      console.log('Health Professional logged in successfully');
      router.push('/(tab)/homescreen');
      return true;
    } catch {
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
        role: 'health_professional',
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
        user: response.user,
        isAuthenticated: true,
        loading: false,
      });
      // Reset form after successful registration
      get().resetForm();
    } catch {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
    }
  },

  // ============ HEALTH PROFESSIONAL LOGOUT ============
  HealthProfessionalLogout: async () => {
    await removeToken();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
      userDraft: emptyDraft,
      healthProfessionalDraft: emptyHealthProfessionalDraft,
    });
    console.log('Health Professional logged out');
  },
}));
