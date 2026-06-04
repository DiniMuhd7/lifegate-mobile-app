import api from './api';
import type {
  HealthTimelineEntry,
  HealthTimelineResponse,
  AlertsResponse,
} from 'types/health-types';
import type { PatientReport } from 'types/professional-types';

// Shape returned by /physician/reports for the doctor timeline
interface BackendPhysicianReport {
  id: string;
  user_id: string;
  patient_name: string;
  title: string;
  description: string;
  condition: string;
  urgency: string;
  status: string;
  escalated: boolean;
  physician_notes: string;
  created_at: string;
  updated_at: string;
}

const mapPhysicianToTimeline = (r: BackendPhysicianReport): HealthTimelineEntry => ({
  id: r.id,
  title: r.title || 'Untitled',
  condition: r.condition || '',
  description: r.description || '',
  urgency: (r.urgency as HealthTimelineEntry['urgency']) || 'LOW',
  status: (r.status as HealthTimelineEntry['status']) || 'Pending',
  escalated: r.escalated ?? false,
  confidence: 0,
  physicianNotes: r.physician_notes || undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at || r.created_at,
  patientName: r.patient_name || 'Unknown Patient',
  patientId: r.user_id,
});

export const HealthService = {
  /**
   * Patient: fetch own diagnosis history as a timeline (GET /diagnoses).
   */
  async getPatientTimeline(page = 1, pageSize = 50): Promise<HealthTimelineResponse> {
    const response = await api.get<{
      success: boolean;
      data: { records: HealthTimelineEntry[]; total: number; page: number; pageSize: number };
    }>('/diagnoses', { params: { page, pageSize } });
    if (!response.data.success) throw new Error('Failed to fetch health timeline');
    const d = response.data.data;
    return { entries: d.records ?? [], total: d.total, page: d.page, pageSize: d.pageSize };
  },

  /**
   * Physician: fetch all patient reports as a timeline (GET /physician/reports).
   */
  async getPhysicianTimeline(page = 1, pageSize = 100): Promise<HealthTimelineResponse> {
    const response = await api.get<{
      success: boolean;
      data: { reports: BackendPhysicianReport[]; total: number; page: number; pageSize: number };
    }>('/physician/reports', { params: { page, pageSize } });
    if (!response.data.success) throw new Error('Failed to fetch physician timeline');
    const entries = (response.data.data.reports ?? []).map(mapPhysicianToTimeline);
    return {
      entries,
      total: response.data.data.total,
      page: response.data.data.page,
      pageSize: response.data.data.pageSize,
    };
  },

  /**
   * Patient: fetch preventive alerts (GET /alerts).
   */
  async getPatientAlerts(): Promise<AlertsResponse> {
    const response = await api.get<{ success: boolean; data: AlertsResponse }>('/alerts');
    if (!response.data.success) throw new Error('Failed to fetch alerts');
    return response.data.data;
  },

  /**
   * Physician: fetch workload alerts (GET /physician/alerts).
   */
  async getPhysicianAlerts(): Promise<AlertsResponse> {
    const response = await api.get<{ success: boolean; data: AlertsResponse }>(
      '/physician/alerts'
    );
    if (!response.data.success) throw new Error('Failed to fetch physician alerts');
    return response.data.data;
  },
};
