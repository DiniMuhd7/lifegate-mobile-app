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
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<boolean>;
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
    console.log(response.user)
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
      console.log('Password changed successfully');
      return true;
    } catch (err: any) {
      setUser({ loading: false, error: extractErrorMessage(err) });
      return false;
    }
  },
}));
