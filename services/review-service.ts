import { ReviewAnalysis, Activity, ActivityMetric } from '../types/professional-types';

/**
 * Mock Activities Data
 */
const generateMockActivities = (): Activity[] => [
  {
    id: '1',
    patientId: 'PT-1023',
    caseType: 'Verified',
    condition: 'Hypertension',
    timestamp: new Date().toISOString(),
    timeAgo: '1h ago',
  },
  {
    id: '2',
    patientId: 'PT-2045',
    caseType: 'Escalated',
    condition: 'Severe Asthma',
    timestamp: new Date().toISOString(),
    timeAgo: '3h ago',
  },
  {
    id: '3',
    patientId: 'PT-3108',
    caseType: 'Rejected',
    condition: 'Routine Checkup',
    timestamp: new Date().toISOString(),
    timeAgo: '6h ago',
  },
];

/**
 * Mock Metrics Data - Chart percentages with colors matching screenshot
 * Pending: 19% (Orange)
 * Active: 44% (Blue)
 * Completed: 37% (Green)
 */
const generateMockMetrics = (): ActivityMetric[] => [
  { label: 'Pending', percentage: 19, color: '#F59E0B' },
  { label: 'Active', percentage: 44, color: '#3B82F6' },
  { label: 'Completed', percentage: 37, color: '#10B981' },
];

export const ReviewService = {
  /**
   * Get review analysis for a specific date
   * Returns all review data including stats, activities, and chart metrics
   */
  async getReviewAnalysis(date: Date): Promise<ReviewAnalysis> {
    try {
      // Simulate API call duration
      await new Promise(resolve => setTimeout(resolve, 800));

      return {
        date,
        totalReview: 64,
        pendingCases: 12,
        activeCases: 28,
        completedCases: 24,
        activities: generateMockActivities(),
        metrics: generateMockMetrics(),
        loading: false,
        error: null,
      };
    } catch (error) {
      console.error('Error fetching review analysis:', error);
      return {
        date,
        totalReview: 0,
        pendingCases: 0,
        activeCases: 0,
        completedCases: 0,
        activities: [],
        metrics: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch review analysis',
      };
    }
  },

  /**
   * Get date range analysis
   */
  async getDateRangeAnalysis(startDate: Date, endDate: Date): Promise<ReviewAnalysis> {
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      return {
        date: startDate,
        totalReview: 64,
        pendingCases: 12,
        activeCases: 28,
        completedCases: 24,
        activities: generateMockActivities(),
        metrics: generateMockMetrics(),
        loading: false,
        error: null,
      };
    } catch (error) {
      console.error('Error fetching date range analysis:', error);
      return {
        date: startDate,
        totalReview: 0,
        pendingCases: 0,
        activeCases: 0,
        completedCases: 0,
        activities: [],
        metrics: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch analysis',
      };
    }
  },
};