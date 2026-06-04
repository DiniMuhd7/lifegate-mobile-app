import api from './api';
import type { ReferralStats } from 'types/referral-types';

export const ReferralService = {
  async getStats(): Promise<ReferralStats> {
    const res = await api.get<{ success: boolean; data: ReferralStats }>('/referral/stats');
    if (!res.data.success || !res.data.data) {
      throw new Error('Failed to fetch referral stats');
    }
    return res.data.data;
  },
};
