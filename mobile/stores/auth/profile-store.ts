// ============================================================
// PROFILE STORE (ZUSTAND)
// Manages: profile operations (fetch profile, change password)
// Note: Profile data is stored in auth-store.user
// ============================================================

import { create } from 'zustand';
import { AuthService } from 'services/auth-service';
import { extractErrorMessage } from 'utils/error-utils';
import { useAuthStore } from './auth-store';

type ProfileState = {
  // UI state
  loading: boolean;
  error: string | null;
 
  // Actions
  clearError: () => void;
  getProfile: () => Promise<boolean>;
  updateBasicProfile: (data: { name?: string; phone?: string }) => Promise<boolean>;
  updateHealthProfile: (data: {
    blood_type?: string | null;
    genotype?: string | null;
    allergies?: string | null;
    medical_history?: string | null;
    current_medications?: string | null;
    emergency_contact?: string | null;
    language?: string | null;
  }) => Promise<boolean>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<boolean>;
  requestAccountDeletion: () => Promise<boolean>;
  cancelAccountDeletion: () => Promise<boolean>;
};

export const useProfileStore = create<ProfileState>((setUser) => ({
  // -------- State --------
  loading: false,
  error: null,

  // -------- Actions --------

  // Clear any error
  clearError: () => setUser({ error: null }),

  // -------- PROFILE: GET PROFILE --------
getProfile: async () => {
  setUser({ loading: true, error: null });
  try {
    const response = await AuthService.getProfile();
    if (!response.success || !response.user) {
      setUser({ loading: false, error: response.message ?? 'Failed to fetch profile' });
      return false;
    }
    // Update auth store with fetched user data
    useAuthStore.setState({ user: response.user, isAuthenticated: true });
    setUser({ loading: false, error: null });
    return true;
  } catch (err: any) {
    setUser({ loading: false, error: extractErrorMessage(err) });
    return false;
  }
},
  // -------- PROFILE: UPDATE HEALTH PROFILE --------
  updateBasicProfile: async (data) => {
    setUser({ loading: true, error: null });
    try {
      const response = await AuthService.updateBasicProfile(data);
      if (!response.success) {
        setUser({ loading: false, error: response.message ?? 'Failed to update profile' });
        return false;
      }
      if (response.user) {
        useAuthStore.setState({ user: response.user, isAuthenticated: true });
      }
      setUser({ loading: false, error: null });
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
  // -------- PROFILE: UPDATE HEALTH PROFILE --------
  updateHealthProfile: async (data) => {
    setUser({ loading: true, error: null });
    try {
      const response = await AuthService.updateHealthProfile(data);
      if (!response.success) {
        setUser({ loading: false, error: response.message ?? 'Failed to update health profile' });
        return false;
      }
      if (response.user) {
        useAuthStore.setState({ user: response.user, isAuthenticated: true });
      }
      setUser({ loading: false, error: null });
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
  // -------- PROFILE: CHANGE PASSWORD --------
  changePassword: async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    setUser({ loading: true, error: null });
    try {
      const response = await AuthService.changePassword(currentPassword, newPassword, confirmPassword);
      if (!response.success) {
        setUser({ loading: false, error: response.message ?? 'Failed to change password' });
        return false;
      }
      setUser({ loading: false, error: null });
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- ACCOUNT DELETION: REQUEST --------
  requestAccountDeletion: async () => {
    setUser({ loading: true, error: null });
    try {
      const response = await AuthService.requestAccountDeletion();
      if (!response.success) {
        setUser({ loading: false, error: response.message ?? 'Failed to schedule account deletion' });
        return false;
      }
      if (response.user) {
        useAuthStore.setState({ user: response.user, isAuthenticated: true });
      }
      setUser({ loading: false, error: null });
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },

  // -------- ACCOUNT DELETION: CANCEL --------
  cancelAccountDeletion: async () => {
    setUser({ loading: true, error: null });
    try {
      const response = await AuthService.cancelAccountDeletion();
      if (!response.success) {
        setUser({ loading: false, error: response.message ?? 'Failed to cancel account deletion' });
        return false;
      }
      if (response.user) {
        useAuthStore.setState({ user: response.user, isAuthenticated: true });
      }
      setUser({ loading: false, error: null });
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
}));
