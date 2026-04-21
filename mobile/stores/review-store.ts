import { create } from 'zustand';
import { ReviewAnalysis } from '../types/professional-types';
import { ReviewService } from '../services/review-service';

type RangeMode = 'day' | '7d' | '30d';

type ReviewStore = ReviewAnalysis & {
  refreshing: boolean;
  /** Tracks whether the last load was a single-day or range request. */
  rangeMode: RangeMode;
  /** Start of the last fetched range (used by refreshAnalysis). */
  rangeStart: Date | null;
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
  rangeMode: '7d',
  rangeStart: null,

  fetchReviewAnalysis: async (date: Date) => {
    set({ loading: true, error: null, rangeMode: 'day', rangeStart: date });
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
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
    const mode: RangeMode = days <= 1 ? 'day' : days <= 7 ? '7d' : '30d';
    set({ loading: true, error: null, rangeMode: mode, rangeStart: startDate });
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
    const { date, rangeMode, rangeStart } = get();
    set({ refreshing: true, error: null });
    try {
      let analysis;
      if (rangeMode === 'day' || !rangeStart) {
        analysis = await ReviewService.getReviewAnalysis(date);
      } else {
        analysis = await ReviewService.getDateRangeAnalysis(rangeStart, date);
      }
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