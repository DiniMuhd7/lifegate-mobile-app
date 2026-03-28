import api from './api';
import { ReviewAnalysis, ActivityMetric, Activity } from '../types/professional-types';

// Shape returned by GET /review/analysis
interface AnalysisRow {
  date: string;
  totalDiagnoses: number;
  lowUrgency: number;
  mediumUrgency: number;
  highUrgency: number;
  criticalUrgency: number;
  completed: number;
  pending: number;
}

interface ActivityRow {
  id: string;
  patientId: string;
  patientName?: string;
  caseType: 'Verified' | 'Escalated' | 'Pending';
  condition: string;
  timestamp: string;
  timeAgo: string;
}

const buildReviewAnalysis = (rows: AnalysisRow[], activities: ActivityRow[], date: Date): ReviewAnalysis => {
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.totalDiagnoses,
      pending: acc.pending + r.pending,
      completed: acc.completed + r.completed,
    }),
    { total: 0, pending: 0, completed: 0 }
  );

  const active = Math.max(0, totals.total - totals.pending - totals.completed);

  const metrics: ActivityMetric[] =
    totals.total > 0
      ? [
          { label: 'Pending', percentage: Math.round((totals.pending / totals.total) * 100), color: '#F59E0B' },
          { label: 'Active', percentage: Math.round((active / totals.total) * 100), color: '#3B82F6' },
          { label: 'Completed', percentage: Math.round((totals.completed / totals.total) * 100), color: '#10B981' },
        ]
      : [
          { label: 'Pending', percentage: 0, color: '#F59E0B' },
          { label: 'Active', percentage: 0, color: '#3B82F6' },
          { label: 'Completed', percentage: 0, color: '#10B981' },
        ];

  const mappedActivities: Activity[] = (activities ?? []).map((a) => ({
    id: a.id,
    patientId: a.patientId,
    patientName: a.patientName,
    caseType: a.caseType,
    condition: a.condition,
    timestamp: a.timestamp,
    timeAgo: a.timeAgo,
  }));

  return {
    date,
    totalReview: totals.total,
    pendingCases: totals.pending,
    activeCases: active,
    completedCases: totals.completed,
    activities: mappedActivities,
    metrics,
    loading: false,
    error: null,
  };
};

const formatDate = (d: Date): string => d.toISOString().split('T')[0];

const emptyAnalysis = (date: Date, errorMsg: string): ReviewAnalysis => ({
  date,
  totalReview: 0,
  pendingCases: 0,
  activeCases: 0,
  completedCases: 0,
  activities: [],
  metrics: [
    { label: 'Pending', percentage: 0, color: '#F59E0B' },
    { label: 'Active', percentage: 0, color: '#3B82F6' },
    { label: 'Completed', percentage: 0, color: '#10B981' },
  ],
  loading: false,
  error: errorMsg,
});

export const ReviewService = {
  /**
   * Get review analysis for a specific date
   * GET /review/analysis?date=YYYY-MM-DD
   */
  async getReviewAnalysis(date: Date): Promise<ReviewAnalysis> {
    try {
      const response = await api.get<{ success: boolean; data: AnalysisRow[]; activities: ActivityRow[] }>(
        '/review/analysis',
        { params: { date: formatDate(date) } }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch review analysis');
      }

      return buildReviewAnalysis(response.data.data ?? [], response.data.activities ?? [], date);
    } catch (error) {
      console.error('Error fetching review analysis:', error);
      return emptyAnalysis(date, error instanceof Error ? error.message : 'Failed to fetch review analysis');
    }
  },

  /**
   * Get date range analysis
   * GET /review/analysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   */
  async getDateRangeAnalysis(startDate: Date, endDate: Date): Promise<ReviewAnalysis> {
    try {
      const response = await api.get<{ success: boolean; data: AnalysisRow[]; activities: ActivityRow[] }>(
        '/review/analysis',
        { params: { startDate: formatDate(startDate), endDate: formatDate(endDate) } }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch date range analysis');
      }

      return buildReviewAnalysis(response.data.data ?? [], response.data.activities ?? [], startDate);
    } catch (error) {
      console.error('Error fetching date range analysis:', error);
      return emptyAnalysis(startDate, error instanceof Error ? error.message : 'Failed to fetch analysis');
    }
  },
};