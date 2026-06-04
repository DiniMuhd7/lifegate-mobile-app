import api from './api';
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
};
