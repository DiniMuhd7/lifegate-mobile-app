import { create } from 'zustand';
import { ReviewAnalysis } from '../types/professional-types';
import { ReviewService } from '../services/review-service';

type ReviewStore = ReviewAnalysis & {
  refreshing: boolean;
  fetchReviewAnalysis: (date: Date) => Promise<void>;
  fetchDateRangeAnalysis: (startDate: Date, endDate: Date) => Promise<void>;
  refreshAnalysis: () => Promise<void>;
  setSelectedDate: (date: Date) => void;
};

export const useReviewStore = create<ReviewStore>((set, get) => ({
  date: new Date(),
  totalReview: 0,
  pendingCases: 0,
  activeCases: 0,
  completedCases: 0,
  activities: [],
  metrics: [],
  loading: true,
  refreshing: false,
  error: null,

  fetchReviewAnalysis: async (date: Date) => {
    set({ loading: true, error: null });
    try {
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

  fetchDateRangeAnalysis: async (startDate: Date, endDate: Date) => {
    set({ loading: true, error: null });
    try {
      const analysis = await ReviewService.getDateRangeAnalysis(startDate, endDate);
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

  refreshAnalysis: async () => {
    const { date } = get();
    set({ refreshing: true, error: null });
    try {
      const analysis = await ReviewService.getReviewAnalysis(date);
      set({
        date: analysis.date,
        totalReview: analysis.totalReview,
        pendingCases: analysis.pendingCases,
        activeCases: analysis.activeCases,
        completedCases: analysis.completedCases,
        activities: analysis.activities,
        metrics: analysis.metrics,
        refreshing: false,
        error: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to refresh analysis',
        refreshing: false,
      });
    }
  },

  setSelectedDate: (date: Date) => {
    set({ date });
  },
}));