import { create } from 'zustand';
import { LifeFundService } from 'services/lifefund-service';
import type {
  LifeFundAdminActionInput,
  LifeFundAuditEntry,
  LifeFundDashboardSummary,
  LifeFundRequest,
} from 'types/lifefund-types';

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

interface LifeFundAdminState {
  summary: LifeFundDashboardSummary | null;
  requests: LifeFundRequest[];
  total: number;
  statusFilter: string; // '' = all
  searchQuery: string;

  selectedRequest: LifeFundRequest | null;
  auditTrail: LifeFundAuditEntry[];

  loadingSummary: boolean;
  loadingRequests: boolean;
  loadingDetail: boolean;
  applyingAction: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  setStatusFilter: (status: string) => void;
  setSearchQuery: (q: string) => void;
  fetchRequestDetail: (id: string) => Promise<void>;
  applyAction: (id: string, input: LifeFundAdminActionInput) => Promise<boolean>;
  recordRepayment: (id: string, amount: number, providerRef?: string) => Promise<boolean>;
  clearError: () => void;
}

export const useLifeFundAdminStore = create<LifeFundAdminState>((set, get) => ({
  summary: null,
  requests: [],
  total: 0,
  statusFilter: '',
  searchQuery: '',

  selectedRequest: null,
  auditTrail: [],

  loadingSummary: false,
  loadingRequests: false,
  loadingDetail: false,
  applyingAction: false,
  error: null,

  fetchSummary: async () => {
    set({ loadingSummary: true, error: null });
    try {
      const summary = await LifeFundService.adminGetDashboard();
      set({ summary, loadingSummary: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund dashboard'), loadingSummary: false });
    }
  },

  fetchRequests: async () => {
    set({ loadingRequests: true, error: null });
    try {
      const { statusFilter, searchQuery } = get();
      const { requests, total } = await LifeFundService.adminListRequests({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      });
      set({ requests, total, loadingRequests: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund requests'), loadingRequests: false });
    }
  },

  setStatusFilter: (status: string) => {
    set({ statusFilter: status });
    get().fetchRequests();
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),

  fetchRequestDetail: async (id: string) => {
    set({ loadingDetail: true, error: null });
    try {
      const { request, auditTrail } = await LifeFundService.adminGetRequest(id);
      set({ selectedRequest: request, auditTrail, loadingDetail: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund request'), loadingDetail: false });
    }
  },

  applyAction: async (id: string, input: LifeFundAdminActionInput) => {
    set({ applyingAction: true, error: null });
    try {
      const request = await LifeFundService.adminApplyAction(id, input);
      set({ selectedRequest: request, applyingAction: false });
      await get().fetchRequests();
      await get().fetchSummary();
      return true;
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to apply action'), applyingAction: false });
      return false;
    }
  },

  recordRepayment: async (id: string, amount: number, providerRef?: string) => {
    set({ applyingAction: true, error: null });
    try {
      const request = await LifeFundService.adminRecordRepayment(id, { amount, providerRef });
      set({ selectedRequest: request, applyingAction: false });
      await get().fetchRequests();
      await get().fetchSummary();
      return true;
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to record repayment'), applyingAction: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
