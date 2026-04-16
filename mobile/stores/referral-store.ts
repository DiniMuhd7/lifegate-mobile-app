import { create } from 'zustand';
import { ReferralService } from 'services/referral-service';
import type { ReferralStats } from 'types/referral-types';

interface ReferralState {
  stats: ReferralStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  clearError: () => void;
}

export const useReferralStore = create<ReferralState>((set) => ({
  stats: null,
  loading: false,
  error: null,

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await ReferralService.getStats();
      set({ stats, loading: false });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load referral data';
      set({ error: message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
