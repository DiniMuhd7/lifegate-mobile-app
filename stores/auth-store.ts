// ============================================================
// AUTH STORE (ZUSTAND)
// Handles authentication state and talks to AuthService.
// Screens (Login/Register) only call store actions.
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { AuthUser } from 'types/auth-types';
import { router } from 'expo-router';

// ---------------------------
// Type describing the form data shared by Login & Register
// ---------------------------
export type UserDraft = {
  name: string; // registration only
  email: string;
  password: string;
  confirm: string; // registration only
  phone: string; // profile details (step 2 of registration)
  dob: string;
  gender: string;
  language: string;
  healthHistory: string; // profile details (step 2 of registration)
};

// ---------------------------
// What the store exposes
// ---------------------------
type AuthState = {
  // form state
  userDraft: UserDraft;

  // authenticated user
  user: AuthUser | null;
  isAuthenticated: boolean;

  // UI state
  loading: boolean;
  error: string | null;

  // actions
  setField: (field: keyof UserDraft, value: string) => void;
  resetForm: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  register: () => Promise<void>; // placeholder for now
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

// ---------------------------
// Creating the store
// ---------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  // ---------------- state ----------------
  userDraft: emptyDraft,
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  // ---------------- actions ----------------

  // update any field in the form
  setField: (field, value) =>
    set((state) => ({
      userDraft: { ...state.userDraft, [field]: value },
    })),

  // reset form to initial state
  resetForm: () => set({ userDraft: emptyDraft }),

  // clear any error
  clearError: () => set({ error: null }),

  // ---------------- LOGIN ----------------
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

      console.log('User logged in successfully');
      console.log('User logged in successfully: ', response.user);
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
  logout: () => {
    set({
      user: null,
      isAuthenticated: false,
      error: null,
      userDraft: emptyDraft,
    });
    console.log('User logged out');
  },

  // ---------------- REGISTER ----------------
  register: async () => {
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
        userDraft: { ...get().userDraft, password: '', confirm: '' }, // clear sensitive fields
      });
    } catch (err) {
      set({
        loading: false,
        error: 'Network error. Please try again.',
      });
    }
  },
}));
