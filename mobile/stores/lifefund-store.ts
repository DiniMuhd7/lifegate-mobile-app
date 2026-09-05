import { create } from 'zustand';
import { LifeFundService } from 'services/lifefund-service';
import { extractErrorMessage } from 'utils/error-utils';
import type {
  LifeFundAccount,
  LifeFundEligibility,
  LifeFundRequest,
  SubmitLifeFundRequestInput,
} from 'types/lifefund-types';

function errorMessage(e: unknown, fallback: string): string {
  const message = extractErrorMessage(e);
  return message && message !== 'An error occurred. Please try again.' ? message : fallback;
}

interface LifeFundState {
  account: LifeFundAccount | null;
  eligibility: LifeFundEligibility | null;
  requests: LifeFundRequest[];
  activeRequest: LifeFundRequest | null;

  loadingAccount: boolean;
  loadingRequests: boolean;
  submitting: boolean;
  error: string | null;

  fetchAccount: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchRequest: (id: string) => Promise<void>;
  submitRequest: (input: SubmitLifeFundRequestInput) => Promise<LifeFundRequest | null>;
  acceptAgreement: (id: string) => Promise<boolean>;
  payInstallment: (id: string, amount: number, providerRef?: string) => Promise<boolean>;
  clearError: () => void;
}

export const useLifeFundStore = create<LifeFundState>((set, get) => ({
  account: null,
  eligibility: null,
  requests: [],
  activeRequest: null,

  loadingAccount: false,
  loadingRequests: false,
  submitting: false,
  error: null,

  fetchAccount: async () => {
    set({ loadingAccount: true, error: null });
    try {
      const { account, eligibility } = await LifeFundService.getAccount();
      set({ account, eligibility, loadingAccount: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund account'), loadingAccount: false });
    }
  },

  fetchRequests: async () => {
    set({ loadingRequests: true, error: null });
    try {
      const requests = await LifeFundService.listMyRequests();
      set({ requests, loadingRequests: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund requests'), loadingRequests: false });
    }
  },

  fetchRequest: async (id: string) => {
    set({ error: null });
    try {
      const request = await LifeFundService.getRequest(id);
      set({ activeRequest: request });
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to load LifeFund request') });
    }
  },

  submitRequest: async (input: SubmitLifeFundRequestInput) => {
    set({ submitting: true, error: null });
    try {
      const request = await LifeFundService.submitRequest(input);
      set((state) => ({ requests: [request, ...state.requests], submitting: false, activeRequest: request }));
      await get().fetchAccount();
      return request;
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to submit LifeFund request'), submitting: false });
      return null;
    }
  },

  acceptAgreement: async (id: string) => {
    set({ error: null });
    try {
      const request = await LifeFundService.acceptAgreement(id);
      set({ activeRequest: request });
      return true;
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to accept LifeFund agreement') });
      return false;
    }
  },

  payInstallment: async (id: string, amount: number, providerRef?: string) => {
    set({ error: null });
    try {
      const request = await LifeFundService.payInstallment(id, { amount, providerRef });
      set({ activeRequest: request });
      await get().fetchAccount();
      return true;
    } catch (e: unknown) {
      set({ error: errorMessage(e, 'Failed to record repayment') });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
