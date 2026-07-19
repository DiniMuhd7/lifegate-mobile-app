import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import api from './api';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function filenameFromDisposition(disposition?: string): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `lifegate-db-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`;
}

import type {
  DashboardStats,
  AdminCaseRow,
  SLAItem,
  EDISMetrics,
  PhysicianRow,
  PhysicianDetail,
  AdminCaseFilters,
  PaginatedCases,
  CreatePhysicianInput,
  UpdatePhysicianInput,
  SLABreachAlert,
  ReassignmentLogResult,
  AuditEvent,
  AuditFilters,
  PaginatedAudit,
  AdminTransactionRow,
  PaginatedTransactions,
  NDPASnapshot,
  AlertThreshold,
  MedicationReleaseRow,
  AnalyticsData,
  PatientRow,
  PatientImportSummary,
  PatientHealthUpdatePayload,
  BulkPatientEmailDraft,
  BulkPatientEmailResult,
} from '../types/admin-types';

export const AdminService = {
  async getDashboard(): Promise<DashboardStats> {
    const { data } = await api.get('/admin/dashboard');
    return data.data as DashboardStats;
  },

  async getCases(filters: AdminCaseFilters = {}): Promise<PaginatedCases> {
    const params: Record<string, string | number> = {};
    if (filters.status)   params.status   = filters.status;
    if (filters.urgency)  params.urgency  = filters.urgency;
    if (filters.category) params.category = filters.category;
    if (filters.search)   params.search   = filters.search;
    if (filters.page)     params.page     = filters.page;
    if (filters.pageSize) params.pageSize = filters.pageSize;

    const { data } = await api.get('/admin/cases', { params });
    return { data: data.data as AdminCaseRow[], meta: data.meta };
  },

  async getSLA(): Promise<SLAItem[]> {
    const { data } = await api.get('/admin/sla');
    return data.data as SLAItem[];
  },

  async getEDISMetrics(days = 30): Promise<EDISMetrics> {
    const { data } = await api.get('/admin/metrics/edis', { params: { days } });
    return data.data as EDISMetrics;
  },


  async downloadDatabaseBackup(): Promise<string> {
    const response = await api.get<ArrayBuffer>('/admin/database/backup', { responseType: 'arraybuffer' });
    const filename = filenameFromDisposition(response.headers?.['content-disposition']);
    const bytes = response.data;

    if (Platform.OS === 'web') {
      const blob = new Blob([bytes], { type: response.headers?.['content-type'] ?? 'application/gzip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return filename;
    }

    const uri = `${FileSystem.cacheDirectory ?? ''}${filename}`;
    await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/gzip',
        dialogTitle: 'Save LifeGate Database Backup',
      });
    }
    return uri;
  },

  // ── Physician account management ──────────────────────────────────────────

  async getPhysicians(): Promise<PhysicianRow[]> {
    const { data } = await api.get('/admin/physicians');
    return data.data as PhysicianRow[];
  },

  async getPhysicianDetail(id: string): Promise<PhysicianDetail> {
    const { data } = await api.get(`/admin/physicians/${id}`);
    return data.data as PhysicianDetail;
  },

  async createPhysician(input: CreatePhysicianInput): Promise<{ id: string }> {
    const { data } = await api.post('/admin/physicians', input);
    return data.data as { id: string };
  },

  async updatePhysician(id: string, input: UpdatePhysicianInput): Promise<void> {
    await api.patch(`/admin/physicians/${id}`, input);
  },

  async deletePhysician(id: string): Promise<void> {
    await api.delete(`/admin/physicians/${id}`);
  },

  async suspendPhysician(id: string, reason?: string): Promise<void> {
    await api.post(`/admin/physicians/${id}/suspend`, { reason: reason ?? '' });
  },

  async unsuspendPhysician(id: string): Promise<void> {
    await api.post(`/admin/physicians/${id}/unsuspend`);
  },

  async overrideMDCN(id: string, status: 'confirmed' | 'rejected'): Promise<void> {
    await api.post(`/admin/physicians/${id}/mdcn-override`, { status });
  },

  async triggerFlagCheck(): Promise<{ newlyFlagged: number }> {
    const { data } = await api.post('/admin/physicians/flag-check');
    return data.data as { newlyFlagged: number };
  },

  // ── SLA Enforcement ───────────────────────────────────────────────────────

  /** Returns the most recent SLA breach events for the admin alert panel. */
  async getSLABreachAlerts(limit = 50): Promise<SLABreachAlert[]> {
    const { data } = await api.get('/admin/sla/breach-alerts', { params: { limit } });
    return data.data as SLABreachAlert[];
  },

  /** Returns a paginated list of successful auto-reassignment events. */
  async getReassignmentLog(page = 1, pageSize = 20): Promise<ReassignmentLogResult> {
    const { data } = await api.get('/admin/sla/reassignment-log', { params: { page, pageSize } });
    return { data: data.data as SLABreachAlert[], meta: data.meta };
  },

  // ── Audit Log ─────────────────────────────────────────────────────────────

  async getAuditLog(filters: AuditFilters = {}): Promise<PaginatedAudit> {
    const params: Record<string, string | number> = {};
    if (filters.eventType) params.eventType = filters.eventType;
    if (filters.actorRole) params.actorRole = filters.actorRole;
    if (filters.resource)  params.resource  = filters.resource;
    if (filters.dateFrom)  params.dateFrom  = filters.dateFrom;
    if (filters.dateTo)    params.dateTo    = filters.dateTo;
    if (filters.page)      params.page      = filters.page;
    if (filters.pageSize)  params.pageSize  = filters.pageSize;
    const { data } = await api.get('/admin/audit', { params });
    return { data: data.data as AuditEvent[], meta: data.meta };
  },

  // ── Transactions ──────────────────────────────────────────────────────────

  async getAllTransactions(status = '', page = 1, pageSize = 20): Promise<PaginatedTransactions> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) params.status = status;
    const { data } = await api.get('/admin/transactions', { params });
    return { data: data.data as AdminTransactionRow[], meta: data.meta };
  },

  // ── NDPA Compliance ───────────────────────────────────────────────────────

  async getNDPASnapshots(limit = 10): Promise<NDPASnapshot[]> {
    const { data } = await api.get('/admin/compliance/ndpa', { params: { limit } });
    return data.data as NDPASnapshot[];
  },

  async generateNDPASnapshot(): Promise<NDPASnapshot> {
    const { data } = await api.post('/admin/compliance/ndpa/generate');
    return data.data as NDPASnapshot;
  },

  // ── Alert Thresholds ──────────────────────────────────────────────────────

  async getAlertThresholds(): Promise<AlertThreshold[]> {
    const { data } = await api.get('/admin/settings/alerts');
    return data.data as AlertThreshold[];
  },

  async updateAlertThreshold(key: string, value: number, enabled: boolean): Promise<void> {
    await api.patch(`/admin/settings/alerts/${key}`, { value, enabled });
  },

  // ── Lifecoins Redemption Approvals ────────────────────────────────────────

  async getPendingRedemptions(): Promise<import('../types/admin-types').LifecoinRedemptionRequest[]> {
    const { data } = await api.get('/admin/lifecoins/redemptions');
    return data.data as import('../types/admin-types').LifecoinRedemptionRequest[];
  },

  async approveRedemption(id: string): Promise<import('../types/admin-types').LifecoinRedemptionRequest> {
    const { data } = await api.post(`/admin/lifecoins/redemptions/${id}/approve`);
    return data.data as import('../types/admin-types').LifecoinRedemptionRequest;
  },

  async rejectRedemption(id: string, note?: string): Promise<void> {
    await api.post(`/admin/lifecoins/redemptions/${id}/reject`, { note: note ?? '' });
  },

  // ── Explore Content ───────────────────────────────────────────────────────

  async triggerExploreRefresh(): Promise<void> {
    await api.post('/admin/explore/refresh');
  },

  // ── Physician Payout Approvals ─────────────────────────────────────────────

  async getPhysicianPayouts(status = 'requested'): Promise<import('../types/admin-types').AdminPayoutView[]> {
    const { data } = await api.get('/admin/physician-payouts', { params: { status } });
    return data.data as import('../types/admin-types').AdminPayoutView[];
  },

  async approvePhysicianPayout(id: string): Promise<void> {
    await api.post(`/admin/physician-payouts/${id}/approve`);
  },

  async rejectPhysicianPayout(id: string, reason: string): Promise<void> {
    await api.post(`/admin/physician-payouts/${id}/reject`, { reason });
  },

  async getMedicationReleases(): Promise<MedicationReleaseRow[]> {
    const { data } = await api.get('/admin/medication-releases');
    return data.data as MedicationReleaseRow[];
  },

  async approveAllMedicationReleases(): Promise<{ approved: number }> {
    const { data } = await api.post('/admin/medication-releases/approve-all');
    return { approved: data.approved as number };
  },

  async approveMedicationRelease(id: string): Promise<void> {
    await api.post(`/admin/medication-releases/${id}/approve`);
  },

  async getAnalytics(days = 30): Promise<AnalyticsData> {
    const { data } = await api.get('/admin/analytics', { params: { days } });
    return data.data as AnalyticsData;
  },

  // ── Patients: registration export & clinical-data CSV import ─────────────

  /** Returns patients registered within the given inclusive date range. */
  async getPatients(dateFrom: string, dateTo: string): Promise<PatientRow[]> {
    const { data } = await api.get('/admin/patients', { params: { dateFrom, dateTo } });
    return data.data as PatientRow[];
  },

  /**
   * Downloads the patients-by-registration-date CSV and opens the native
   * share/save sheet so the admin can save it or send it elsewhere.
   * Returns the local file URI.
   */
  async exportPatientsCSV(dateFrom: string, dateTo: string, testType?: string): Promise<string> {
    const { data: csvText } = await api.get<string>('/admin/patients/export', {
      params: { dateFrom, dateTo, ...(testType ? { testType } : {}) },
      responseType: 'text',
      transformResponse: [(d) => d], // keep raw CSV string, skip JSON parsing
    });

    const filename = testType
      ? `lifegate-patients-${testType}-${dateFrom}-to-${dateTo}.csv`
      : `lifegate-patients-${dateFrom}-to-${dateTo}.csv`;
    const csv = String(csvText);

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return filename;
    }

    const uri = `${FileSystem.cacheDirectory ?? ''}${filename}`;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Patients CSV',
      });
    }
    return uri;
  },

  /**
   * Opens the native document picker for the admin to choose a CSV file,
   * then uploads it to bulk-update patients' blood group, genotype, BMI
   * inputs, and other test-result fields (matched by email). Returns null
   * if the admin cancels the picker.
   */
  async updatePatientHealthData(payload: PatientHealthUpdatePayload): Promise<void> {
    await api.patch('/admin/patients/health-data', payload);
  },

  async getPatientEmailRecipientCount(): Promise<number> {
    const { data } = await api.get('/admin/patients/email-recipients/count');
    return Number(data.data?.recipientCount ?? 0);
  },

  async sendBulkPatientEmail(payload: BulkPatientEmailDraft): Promise<BulkPatientEmailResult> {
    const { data } = await api.post('/admin/patients/email-broadcast', payload);
    return data.data as BulkPatientEmailResult;
  },

  async importPatientsCSV(testType?: string): Promise<PatientImportSummary | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    const form = new FormData();
    if (testType) form.append('testType', testType);
    if (Platform.OS === 'web' && asset.file) {
      form.append('file', asset.file, asset.name || 'patients.csv');
    } else {
      form.append('file', {
        uri: asset.uri,
        name: asset.name || 'patients.csv',
        type: asset.mimeType || 'text/csv',
      } as unknown as Blob);
    }

    const { data } = await api.post('/admin/patients/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data as PatientImportSummary;
  },
};
