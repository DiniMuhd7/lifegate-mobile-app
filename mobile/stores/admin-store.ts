import { create } from 'zustand';
import { AdminService } from '../services/admin-service';
import type {
  DashboardStats,
  AdminCaseRow,
  SLAItem,
  EDISMetrics,
  PhysicianRow,
  PhysicianDetail,
  AdminCaseFilters,
  CreatePhysicianInput,
  UpdatePhysicianInput,
  SLABreachAlert,
  AuditEvent,
  AuditFilters,
  AdminTransactionRow,
  NDPASnapshot,
  AlertThreshold,
  LifecoinRedemptionRequest,
} from '../types/admin-types';

type AdminState = {
  // Data
  dashboard: DashboardStats | null;
  cases: AdminCaseRow[];
  casesTotal: number;
  slaItems: SLAItem[];
  edisMetrics: EDISMetrics | null;
  physicians: PhysicianRow[];
  selectedPhysician: PhysicianDetail | null;
  slaBreachAlerts: SLABreachAlert[];
  reassignmentLog: SLABreachAlert[];
  reassignmentLogTotal: number;

  // Compliance & Audit
  auditEvents: AuditEvent[];
  auditTotal: number;
  auditFilters: AuditFilters;
  transactions: AdminTransactionRow[];
  transactionsTotal: number;
  ndpaSnapshots: NDPASnapshot[];
  alertThresholds: AlertThreshold[];
  pendingRedemptions: LifecoinRedemptionRequest[];
  redemptionsLoading: boolean;

  // Filters
  filters: AdminCaseFilters;

  // UI state
  loading: boolean;
  refreshing: boolean;
  physicianLoading: boolean;
  breachAlertsLoading: boolean;
  reassignmentLogLoading: boolean;
  auditLoading: boolean;
  transactionsLoading: boolean;
  complianceLoading: boolean;
  thresholdsLoading: boolean;
  error: string | null;

  // Actions
  fetchDashboard: () => Promise<void>;
  fetchCases: (filters?: AdminCaseFilters) => Promise<void>;
  fetchSLA: () => Promise<void>;
  fetchEDISMetrics: (days?: number) => Promise<void>;
  fetchPhysicians: () => Promise<void>;
  fetchPhysicianDetail: (id: string) => Promise<void>;
  createPhysician: (input: CreatePhysicianInput) => Promise<string>;
  updatePhysician: (id: string, input: UpdatePhysicianInput) => Promise<void>;
  deletePhysician: (id: string) => Promise<void>;
  suspendPhysician: (id: string, reason?: string) => Promise<void>;
  unsuspendPhysician: (id: string) => Promise<void>;
  overrideMDCN: (id: string, status: 'confirmed' | 'rejected') => Promise<void>;
  triggerFlagCheck: () => Promise<number>;
  fetchSLABreachAlerts: (limit?: number) => Promise<void>;
  fetchReassignmentLog: (page?: number, pageSize?: number) => Promise<void>;
  fetchAuditLog: (filters?: AuditFilters) => Promise<void>;
  fetchAllTransactions: (status?: string, page?: number) => Promise<void>;
  fetchNDPASnapshots: (limit?: number) => Promise<void>;
  generateNDPASnapshot: () => Promise<NDPASnapshot>;
  fetchAlertThresholds: () => Promise<void>;
  updateAlertThreshold: (key: string, value: number, enabled: boolean) => Promise<void>;
  fetchPendingRedemptions: () => Promise<void>;
  approveRedemption: (id: string) => Promise<void>;
  rejectRedemption: (id: string, note?: string) => Promise<void>;
  fetchAll: () => Promise<void>;
  setFilters: (f: Partial<AdminCaseFilters>) => void;
  clearError: () => void;
  clearSelectedPhysician: () => void;
};

export const useAdminStore = create<AdminState>((set, get) => ({
  dashboard: null,
  cases: [],
  casesTotal: 0,
  slaItems: [],
  edisMetrics: null,
  physicians: [],
  selectedPhysician: null,
  slaBreachAlerts: [],
  reassignmentLog: [],
  reassignmentLogTotal: 0,
  auditEvents: [],
  auditTotal: 0,
  auditFilters: { page: 1, pageSize: 30 },
  transactions: [],
  transactionsTotal: 0,
  ndpaSnapshots: [],
  alertThresholds: [],
  pendingRedemptions: [],
  redemptionsLoading: false,
  filters: { status: '', urgency: '', search: '', page: 1, pageSize: 20 },
  loading: false,
  refreshing: false,
  physicianLoading: false,
  breachAlertsLoading: false,
  reassignmentLogLoading: false,
  auditLoading: false,
  transactionsLoading: false,
  complianceLoading: false,
  thresholdsLoading: false,
  error: null,

  fetchDashboard: async () => {
    try {
      const dashboard = await AdminService.getDashboard();
      set({ dashboard });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load dashboard' });
    }
  },

  fetchCases: async (extraFilters?: AdminCaseFilters) => {
    const filters = { ...get().filters, ...extraFilters };
    try {
      const result = await AdminService.getCases(filters);
      set({ cases: result.data, casesTotal: result.meta.total, filters });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load cases' });
    }
  },

  fetchSLA: async () => {
    try {
      const slaItems = await AdminService.getSLA();
      set({ slaItems });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load SLA' });
    }
  },

  fetchEDISMetrics: async (days = 30) => {
    try {
      const edisMetrics = await AdminService.getEDISMetrics(days);
      set({ edisMetrics });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load EDIS metrics' });
    }
  },

  fetchPhysicians: async () => {
    try {
      const physicians = await AdminService.getPhysicians();
      set({ physicians });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load physicians' });
    }
  },

  fetchPhysicianDetail: async (id: string) => {
    set({ physicianLoading: true });
    try {
      const selectedPhysician = await AdminService.getPhysicianDetail(id);
      set({ selectedPhysician, physicianLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load physician', physicianLoading: false });
    }
  },

  createPhysician: async (input: CreatePhysicianInput) => {
    const result = await AdminService.createPhysician(input);
    await get().fetchPhysicians();
    return result.id;
  },

  updatePhysician: async (id: string, input: UpdatePhysicianInput) => {
    await AdminService.updatePhysician(id, input);
    await Promise.all([get().fetchPhysicians(), get().fetchPhysicianDetail(id)]);
  },

  deletePhysician: async (id: string) => {
    await AdminService.deletePhysician(id);
    set((s) => ({ physicians: s.physicians.filter((p) => p.id !== id), selectedPhysician: null }));
  },

  suspendPhysician: async (id: string, reason?: string) => {
    await AdminService.suspendPhysician(id, reason);
    set((s) => ({
      physicians: s.physicians.map((p) =>
        p.id === id ? { ...p, accountStatus: 'suspended' as const } : p
      ),
      selectedPhysician: s.selectedPhysician?.id === id
        ? { ...s.selectedPhysician, accountStatus: 'suspended' as const }
        : s.selectedPhysician,
    }));
  },

  unsuspendPhysician: async (id: string) => {
    await AdminService.unsuspendPhysician(id);
    set((s) => ({
      physicians: s.physicians.map((p) =>
        p.id === id ? { ...p, accountStatus: 'active' as const } : p
      ),
      selectedPhysician: s.selectedPhysician?.id === id
        ? { ...s.selectedPhysician, accountStatus: 'active' as const }
        : s.selectedPhysician,
    }));
  },

  overrideMDCN: async (id: string, status: 'confirmed' | 'rejected') => {
    await AdminService.overrideMDCN(id, status);
    // Reload detail to reflect the new override status and mdcn_verified flag
    await get().fetchPhysicianDetail(id);
    await get().fetchPhysicians();
  },

  triggerFlagCheck: async () => {
    const result = await AdminService.triggerFlagCheck();
    await get().fetchPhysicians();
    return result.newlyFlagged;
  },

  fetchSLABreachAlerts: async (limit = 50) => {
    set({ breachAlertsLoading: true });
    try {
      const slaBreachAlerts = await AdminService.getSLABreachAlerts(limit);
      set({ slaBreachAlerts, breachAlertsLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load SLA breach alerts', breachAlertsLoading: false });
    }
  },

  fetchReassignmentLog: async (page = 1, pageSize = 20) => {
    set({ reassignmentLogLoading: true });
    try {
      const result = await AdminService.getReassignmentLog(page, pageSize);
      set({
        reassignmentLog: result.data,
        reassignmentLogTotal: result.meta.total,
        reassignmentLogLoading: false,
      });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load reassignment log', reassignmentLogLoading: false });
    }
  },

  fetchAuditLog: async (filters?: AuditFilters) => {
    const merged = { ...get().auditFilters, ...filters };
    set({ auditLoading: true, auditFilters: merged });
    try {
      const result = await AdminService.getAuditLog(merged);
      set({ auditEvents: result.data, auditTotal: result.meta.total, auditLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load audit log', auditLoading: false });
    }
  },

  fetchAllTransactions: async (status = '', page = 1) => {
    set({ transactionsLoading: true });
    try {
      const result = await AdminService.getAllTransactions(status, page);
      set({ transactions: result.data, transactionsTotal: result.meta.total, transactionsLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load transactions', transactionsLoading: false });
    }
  },

  fetchNDPASnapshots: async (limit = 10) => {
    set({ complianceLoading: true });
    try {
      const ndpaSnapshots = await AdminService.getNDPASnapshots(limit);
      set({ ndpaSnapshots, complianceLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load NDPA snapshots', complianceLoading: false });
    }
  },

  generateNDPASnapshot: async () => {
    const snapshot = await AdminService.generateNDPASnapshot();
    set((s) => ({ ndpaSnapshots: [snapshot, ...s.ndpaSnapshots] }));
    return snapshot;
  },

  fetchAlertThresholds: async () => {
    set({ thresholdsLoading: true });
    try {
      const alertThresholds = await AdminService.getAlertThresholds();
      set({ alertThresholds, thresholdsLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load alert thresholds', thresholdsLoading: false });
    }
  },

  updateAlertThreshold: async (key: string, value: number, enabled: boolean) => {
    await AdminService.updateAlertThreshold(key, value, enabled);
    set((s) => ({
      alertThresholds: s.alertThresholds.map((t) =>
        t.key === key ? { ...t, value, enabled } : t
      ),
    }));
  },

  fetchPendingRedemptions: async () => {
    set({ redemptionsLoading: true });
    try {
      const pendingRedemptions = await AdminService.getPendingRedemptions();
      set({ pendingRedemptions, redemptionsLoading: false });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load pending redemptions', redemptionsLoading: false });
    }
  },

  approveRedemption: async (id: string) => {
    await AdminService.approveRedemption(id);
    set((s) => ({
      pendingRedemptions: s.pendingRedemptions.filter((r) => r.id !== id),
    }));
  },

  rejectRedemption: async (id: string, note?: string) => {
    await AdminService.rejectRedemption(id, note);
    set((s) => ({
      pendingRedemptions: s.pendingRedemptions.filter((r) => r.id !== id),
    }));
  },

  fetchAll: async () => {
    set({ loading: true, error: null });
    await Promise.all([
      get().fetchDashboard(),
      get().fetchCases(),
      get().fetchSLA(),
      get().fetchEDISMetrics(),
      get().fetchPhysicians(),
      get().fetchSLABreachAlerts(),
      get().fetchReassignmentLog(),
      get().fetchAuditLog(),
      get().fetchAllTransactions(),
      get().fetchNDPASnapshots(),
      get().fetchAlertThresholds(),
    ]);
    set({ loading: false });
  },

  setFilters: (f) => {
    set((state) => ({ filters: { ...state.filters, ...f } }));
  },

  clearError: () => set({ error: null }),
  clearSelectedPhysician: () => set({ selectedPhysician: null }),
}));
