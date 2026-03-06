import { create } from 'zustand';
import { ReviewAnalysis } from '../types/professional-types';
import { ReviewService } from '../services/review-service';

type ReviewStore = ReviewAnalysis & {
  fetchReviewAnalysis: (date: Date) => Promise<void>;
  setSelectedDate: (date: Date) => void;
};

export const useReviewStore = create<ReviewStore>((set) => ({
  date: new Date(),
  totalReview: 0,
  pendingCases: 0,
  activeCases: 0,
  completedCases: 0,
  activities: [],
  metrics: [],
  loading: true,
  error: null,

  fetchReviewAnalysis: async (date: Date) => {
    set({ loading: true, error: null });
    try {
      // Fetch data from service
      const analysis = await ReviewService.getReviewAnalysis(date);
      set({
        date: analysis.date,
        totalReview: analysis.totalReview,
        pendingCases: analysis.pendingCases,
        activeCases: analysis.activeCases,
        completedCases: analysis.completedCases,
        activities: analysis.activities,
        metrics: analysis.metrics,
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch analysis',
        loading: false,
      });
    }
  },

  setSelectedDate: (date: Date) => {
    set({ date });
  },
}));