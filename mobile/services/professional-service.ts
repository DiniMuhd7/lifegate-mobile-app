import api from './api';
import {
  PatientReport,
  ProfessionalStats,
  CaseQueue,
  CaseQueueItem,
  CaseDetail,
  PatientProfile,
  EarningsSummary,
  EarningRecord,
  Payout,
} from '../types/professional-types';

// Helper to format timestamp from ISO string to relative time
const formatTimestamp = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Shape returned by the backend physician reports endpoint
interface BackendReport {
  id: string;
  user_id: string;
  status: string;
  title: string;
  description: string;
  condition: string;
  urgency: string;
  physician_notes: string;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

const mapReport = (r: BackendReport): PatientReport => ({
  id: r.id,
  patientId: r.user_id,
  patientName: r.patient_name || 'Unknown Patient',
  reportType: 'Report',
  title: r.title || 'No title',
  description: r.description || 'No description',
  status: (r.status as PatientReport['status']) || 'Pending',
  timestamp: formatTimestamp(r.created_at),
  createdAt: new Date(r.created_at),
});

export const ProfessionalService = {
  /**
   * Fetch all patient reports for the physician
   * GET /physician/reports
   */
  async getProfessionalReports(page = 1, pageSize = 100): Promise<PatientReport[]> {
    const response = await api.get<{
      success: boolean;
      data: { reports: BackendReport[]; total: number; page: number; pageSize: number };
    }>('/physician/reports', { params: { page, pageSize } });

    if (!response.data.success) {
      throw new Error('Failed to fetch reports');
    }
    return (response.data.data.reports ?? []).map(mapReport);
  },

  /**
   * Get professional dashboard stats
   * GET /physician/stats
   */
  async getProfessionalStats(): Promise<ProfessionalStats> {
    const response = await api.get<{ success: boolean; data: ProfessionalStats }>(
      '/physician/stats'
    );
    if (!response.data.success) {
      throw new Error('Failed to fetch stats');
    }
    return response.data.data;
  },

  /**
   * Submit a review action on a report
   * POST /physician/reports/:id/review
   */
  async submitConsultationResponse(reportId: string, notes: string, action = 'Active'): Promise<void> {
    const response = await api.post<{ success: boolean; message: string }>(
      `/physician/reports/${reportId}/review`,
      { action, notes }
    );
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to submit review');
    }
  },

  /**
   * Placeholder: Get consultations (not yet on backend)
   */
  async getConsultations(): Promise<any[]> {
    return [];
  },

  /**
   * Placeholder: Get chat conversations (not yet on backend)
   */
  async getConversations(): Promise<any[]> {
    return [];
  },

  /**
   * Placeholder: Get specific patient details (not yet on backend)
   */
  async getPatientDetails(patientId: string): Promise<any> {
    return { id: patientId };
  },

  /**
   * Fetch case queue grouped by status
   * GET /physician/cases
   */
  async getCaseQueue(): Promise<CaseQueue> {
    const response = await api.get<{ success: boolean; data: CaseQueue }>(
      '/physician/cases'
    );
    if (!response.data.success) throw new Error('Failed to fetch case queue');
    return response.data.data;
  },

  /**
   * Lock a Pending case to the current physician (Pending → Active)
   * POST /physician/cases/:id/take
   */
  async takeCase(caseId: string): Promise<CaseQueueItem> {
    const response = await api.post<{ success: boolean; data: CaseQueueItem }>(
      `/physician/cases/${caseId}/take`
    );
    if (!response.data.success) throw new Error('Failed to take case');
    return response.data.data;
  },

  /**
   * Complete an Active case (Active → Completed)
   * POST /physician/reports/:id/review  with action='Completed'
   */
  async completeCase(caseId: string, notes: string): Promise<void> {
    const response = await api.post<{ success: boolean; message: string }>(
      `/physician/reports/${caseId}/review`,
      { action: 'Completed', notes }
    );
    if (!response.data.success) throw new Error(response.data.message || 'Failed to complete case');
  },

  /**
   * Register an Expo push token so the backend can send push notifications
   * POST /physician/push-token
   */
  async registerPushToken(token: string): Promise<void> {
    await api.post('/physician/push-token', { token });
  },

  /**
   * Fetch full case detail for the physician review screen
   * GET /physician/cases/:id
   */
  async getCaseDetail(caseId: string): Promise<CaseDetail> {
    const response = await api.get<{ success: boolean; data: CaseDetail }>(
      `/physician/cases/${caseId}`
    );
    if (!response.data.success) throw new Error('Failed to fetch case detail');
    return response.data.data;
  },

  /**
   * Fetch a patient's health profile
   * GET /physician/patients/:id
   */
  async getPatientProfile(patientId: string): Promise<PatientProfile> {
    const response = await api.get<{ success: boolean; data: PatientProfile }>(
      `/physician/patients/${patientId}`
    );
    if (!response.data.success) throw new Error('Failed to fetch patient profile');
    return response.data.data;
  },

  /**
   * Inline-edit AI-generated condition, urgency, and confidence score
   * PATCH /physician/cases/:id/ai
   */
  async updateAIOutput(
    caseId: string,
    condition: string,
    urgency: string,
    confidence: number
  ): Promise<void> {
    const response = await api.patch<{ success: boolean; message: string }>(
      `/physician/cases/${caseId}/ai`,
      { condition, urgency, confidence }
    );
    if (!response.data.success)
      throw new Error(response.data.message || 'Failed to update AI output');
  },

  /**
   * Approve a case (Active → Completed, decision = Approved)
   * POST /physician/reports/:id/review
   */
  async approveCase(caseId: string, notes: string): Promise<void> {
    const response = await api.post<{ success: boolean; message: string }>(
      `/physician/reports/${caseId}/review`,
      { action: 'Completed', notes, physician_decision: 'Approved' }
    );
    if (!response.data.success)
      throw new Error(response.data.message || 'Failed to approve case');
  },

  /**
   * Reject a case (Active → Completed, decision = Rejected)
   * POST /physician/reports/:id/review
   */
  async rejectCase(
    caseId: string,
    rejectionReason: string,
    notes: string
  ): Promise<void> {
    const response = await api.post<{ success: boolean; message: string }>(
      `/physician/reports/${caseId}/review`,
      {
        action: 'Completed',
        notes,
        physician_decision: 'Rejected',
        rejection_reason: rejectionReason,
      }
    );
    if (!response.data.success)
      throw new Error(response.data.message || 'Failed to reject case');
  },

  /**
   * Get the aggregated earnings summary for the physician dashboard.
   * GET /physician/earnings
   */
  async getEarningsSummary(): Promise<EarningsSummary> {
    const res = await api.get<{ success: boolean; data: EarningsSummary }>('/physician/earnings');
    if (!res.data.success) throw new Error('Failed to fetch earnings summary');
    return res.data.data;
  },

  /**
   * Get paginated per-case earnings history.
   * GET /physician/earnings/history?page=&pageSize=
   */
  async getEarningsHistory(
    page = 1,
    pageSize = 20
  ): Promise<{ records: EarningRecord[]; total: number }> {
    const res = await api.get<{
      success: boolean;
      data: { records: EarningRecord[]; total: number };
    }>('/physician/earnings/history', { params: { page, pageSize } });
    if (!res.data.success) throw new Error('Failed to fetch earnings history');
    return res.data.data;
  },

  /**
   * Get all payout records for the physician.
   * GET /physician/payouts
   */
  async getPayouts(): Promise<Payout[]> {
    const res = await api.get<{ success: boolean; data: Payout[] }>('/physician/payouts');
    if (!res.data.success) throw new Error('Failed to fetch payouts');
    return res.data.data;
  },
};
