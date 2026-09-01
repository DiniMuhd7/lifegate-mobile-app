import api from './api';
import type {
  LifeFundAccount,
  LifeFundAdminActionInput,
  LifeFundAuditEntry,
  LifeFundDashboardSummary,
  LifeFundEligibility,
  LifeFundRequest,
  SubmitLifeFundRequestInput,
} from 'types/lifefund-types';

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}

function unwrap<T>(envelope: ApiEnvelope<T>, fallbackError: string): T {
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.message || fallbackError);
  }
  return envelope.data;
}

export const LifeFundService = {
  // ── Patient ────────────────────────────────────────────────────────────

  async getAccount(): Promise<{ account: LifeFundAccount; eligibility: LifeFundEligibility }> {
    const res = await api.get<ApiEnvelope<{ account: LifeFundAccount; eligibility: LifeFundEligibility }>>(
      '/lifefund/account'
    );
    return unwrap(res.data, 'Failed to load LifeFund account');
  },

  async submitRequest(input: SubmitLifeFundRequestInput): Promise<LifeFundRequest> {
    const res = await api.post<ApiEnvelope<LifeFundRequest>>('/lifefund/requests', input);
    return unwrap(res.data, 'Failed to submit LifeFund request');
  },

  async listMyRequests(): Promise<LifeFundRequest[]> {
    const res = await api.get<ApiEnvelope<LifeFundRequest[]>>('/lifefund/requests');
    return unwrap(res.data, 'Failed to load LifeFund requests');
  },

  async getRequest(id: string): Promise<LifeFundRequest> {
    const res = await api.get<ApiEnvelope<LifeFundRequest>>(`/lifefund/requests/${id}`);
    return unwrap(res.data, 'Failed to load LifeFund request');
  },

  async acceptAgreement(id: string): Promise<LifeFundRequest> {
    const res = await api.post<ApiEnvelope<LifeFundRequest>>(`/lifefund/requests/${id}/accept`, {});
    return unwrap(res.data, 'Failed to accept LifeFund agreement');
  },

  async payInstallment(
    id: string,
    input: { amount: number; method?: string; providerRef?: string }
  ): Promise<LifeFundRequest> {
    const res = await api.post<ApiEnvelope<LifeFundRequest>>(`/lifefund/requests/${id}/repayments`, input);
    return unwrap(res.data, 'Failed to record repayment');
  },

  // ── Admin ──────────────────────────────────────────────────────────────

  async adminGetDashboard(): Promise<LifeFundDashboardSummary> {
    const res = await api.get<ApiEnvelope<LifeFundDashboardSummary>>('/admin/lifefund/dashboard');
    return unwrap(res.data, 'Failed to load LifeFund dashboard');
  },

  async adminListRequests(params?: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ requests: LifeFundRequest[]; total: number }> {
    const res = await api.get<ApiEnvelope<{ requests: LifeFundRequest[]; total: number }>>(
      '/admin/lifefund/requests',
      { params }
    );
    return unwrap(res.data, 'Failed to load LifeFund requests');
  },

  async adminGetRequest(id: string): Promise<{ request: LifeFundRequest; auditTrail: LifeFundAuditEntry[] }> {
    const res = await api.get<ApiEnvelope<{ request: LifeFundRequest; auditTrail: LifeFundAuditEntry[] }>>(
      `/admin/lifefund/requests/${id}`
    );
    return unwrap(res.data, 'Failed to load LifeFund request');
  },

  async adminApplyAction(id: string, input: LifeFundAdminActionInput): Promise<LifeFundRequest> {
    const res = await api.post<ApiEnvelope<LifeFundRequest>>(`/admin/lifefund/requests/${id}/action`, input);
    return unwrap(res.data, 'Failed to apply action');
  },

  async adminRecordRepayment(
    id: string,
    input: { amount: number; method?: string; providerRef?: string }
  ): Promise<LifeFundRequest> {
    const res = await api.post<ApiEnvelope<LifeFundRequest>>(`/admin/lifefund/requests/${id}/repayments`, input);
    return unwrap(res.data, 'Failed to record repayment');
  },
};
