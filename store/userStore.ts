// ============================================================
// AUTH STORE (ZUSTAND)
// This file contains ALL authentication logic for the app.
// Screens (Login/Register) DO NOT implement auth logic themselves.
// They only talk to this store. This is called "Separation of Concerns".
// ============================================================

import { create } from 'zustand';

// ---------------------------
// Type describing the form data shared by Login & Register
// ---------------------------
export type UserDraft = {
  name: string;            // used only during registration
  email: string;           // used for login and register
  password: string;        // used for login and register
  confirm: string;         // confirm password (register only)
};

// ---------------------------
// What the store exposes to the rest of the app
// ---------------------------
type AuthState = {
  // form data shared between screens
  userDraft: UserDraft;

  // UI state
  loading: boolean;        // true while network/auth request is happening
  error: string | null;    // holds validation/server error message
  isAuthenticated: boolean;// becomes true after successful login

  // actions (functions that change state)
  setField: (field: keyof UserDraft, value: string) => void;
  register: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => void;
  resetForm: () => void;
};

// ---------------------------
// Initial empty form values
// ---------------------------
const emptyDraft: UserDraft = {
  name: '',
  email: '',
  password: '',
  confirm: '',
};

// ---------------------------
// Creating the store
// ---------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  userDraft: emptyDraft,
  loading: false,
  error: null,
  isAuthenticated: false,

  // ------------------------------------------------------
  // setField
  // Generic function to update ANY form input
  // Instead of having 4 different useState hooks in each screen
  // we update a single shared object.
  // ------------------------------------------------------
  setField: (field, value) =>
    set(state => ({
      userDraft: { ...state.userDraft, [field]: value },
    })),

  // ------------------------------------------------------
  // REGISTER FUNCTION
  // Currently simulated (no backend yet)
  // Later you will replace the timeout with an API call.
  // ------------------------------------------------------
  register: async () => {
    const { name, email, password, confirm } = get().userDraft;

    // client-side validation
    if (!name || !email || !password || !confirm) {
      set({ error: 'All fields are required' });
      return;
    }

    if (password !== confirm) {
      set({ error: 'Passwords do not match' });
      return;
    }

    set({ loading: true, error: null });

    try {
      // simulate server request
      await new Promise(res => setTimeout(res, 1500));

      // after successful register
      set({ isAuthenticated: true, loading: false });
    } catch (e) {
      set({ error: 'Registration failed', loading: false });
    }
  },

  // ------------------------------------------------------
  // LOGIN FUNCTION
  // Also simulated for now
  // ------------------------------------------------------
  login: async () => {
    const { email, password } = get().userDraft;

    if (!email || !password) {
      set({ error: 'Email and password are required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      // simulate authentication
      await new Promise(res => setTimeout(res, 1200));

      // success
      set({ isAuthenticated: true, loading: false });
    } catch (e) {
      set({ error: 'Invalid credentials', loading: false });
    }
  },

  // clears session
  logout: () => set({ isAuthenticated: false }),

  // reset form fields
  resetForm: () => set({ userDraft: emptyDraft }),
}));