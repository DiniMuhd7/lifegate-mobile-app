import { create } from 'zustand';
import { PaymentService } from 'services/payment-service';
import type { CreditBalance, CreditBundle, CreditDeduction, PaymentCurrency, PaymentTransaction } from 'types/payment-types';

interface PaymentState {
  balance: CreditBalance | null;
  bundles: CreditBundle[];
  transactions: PaymentTransaction[];
  deductions: CreditDeduction[];
  paymentLink: string | null;
  activeTxRef: string | null;
  // Per-operation loading flags prevent unrelated UI from flickering when
  // only one operation is in-flight.
  balanceLoading: boolean;
  bundlesLoading: boolean;
  txLoading: boolean;
  deductionsLoading: boolean;
  paymentLoading: boolean;
  /** @deprecated Use the per-operation flags above. Kept for backward compat. */
  loading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  fetchBundles: () => Promise<void>;
  initiatePayment: (bundleId: string, name?: string, currency?: PaymentCurrency) => Promise<void>;
  getTxStatus: (txRef: string) => Promise<PaymentTransaction>;
  verifyPayment: (txRef: string, flwTxId: string) => Promise<PaymentTransaction>;
  fetchTransactions: (limit?: number) => Promise<void>;
  fetchDeductions: (limit?: number) => Promise<void>;
  clearError: () => void;
  clearPaymentLink: () => void;
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  balance: null,
  bundles: [],
  transactions: [],
  deductions: [],
  paymentLink: null,
  activeTxRef: null,
  balanceLoading: false,
  bundlesLoading: false,
  txLoading: false,
  deductionsLoading: false,
  paymentLoading: false,
  loading: false,
  error: null,

  fetchBalance: async () => {
    set({ balanceLoading: true, loading: true, error: null });
    try {
      const balance = await PaymentService.getCreditBalance();
      set({ balance, balanceLoading: false, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load balance';
      set({ error: msg, balanceLoading: false, loading: false });
    }
  },

  fetchBundles: async () => {
    set({ bundlesLoading: true, loading: true, error: null });
    try {
      const bundles = await PaymentService.getBundles();
      set({ bundles, bundlesLoading: false, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load bundles';
      set({ error: msg, bundlesLoading: false, loading: false });
    }
  },

  initiatePayment: async (bundleId: string, name?: string, currency: PaymentCurrency = 'NGN') => {
    set({ paymentLoading: true, loading: true, error: null, paymentLink: null, activeTxRef: null });
    try {
      const res = await PaymentService.initiatePayment(bundleId, name, currency);
      set({ paymentLink: res.paymentLink, activeTxRef: res.txRef, paymentLoading: false, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to initiate payment';
      set({ error: msg, paymentLoading: false, loading: false });
    }
  },

  getTxStatus: async (txRef: string) => {
    return PaymentService.getTxStatus(txRef);
  },

  verifyPayment: async (txRef: string, flwTxId: string) => {
    set({ paymentLoading: true, loading: true });
    try {
      const tx = await PaymentService.verifyPayment(txRef, flwTxId);
      if (tx.status === 'success') {
        // Only clear the active payment link/ref once we know it succeeded.
        set({ paymentLoading: false, loading: false, paymentLink: null, activeTxRef: null });
        await get().fetchBalance();
      } else {
        // pending or failed — leave paymentLink/activeTxRef intact so the
        // caller's retry loop can keep calling without losing the reference.
        set({ paymentLoading: false, loading: false });
      }
      return tx;
    } catch (e: unknown) {
      // Don't set the global error banner here — the caller (handleWebVerify)
      // manages its own retry loop and will show the failure screen if all
      // retries are exhausted. Setting error here would show a red banner
      // mid-retry and confuse the user.
      set({ paymentLoading: false, loading: false });
      throw e;
    }
  },

  fetchTransactions: async (limit = 50) => {
    set({ txLoading: true, loading: true, error: null });
    try {
      const res = await PaymentService.getTransactions(limit);
      set({ transactions: res.transactions ?? [], txLoading: false, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load transactions';
      set({ error: msg, txLoading: false, loading: false });
    }
  },

  fetchDeductions: async (limit = 100) => {
    set({ deductionsLoading: true, error: null });
    try {
      const res = await PaymentService.getCreditDeductions(limit);
      set({ deductions: res.deductions ?? [], deductionsLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load credit deductions';
      set({ error: msg, deductionsLoading: false });
    }
  },

  clearError: () => set({ error: null }),
  clearPaymentLink: () => set({ paymentLink: null, activeTxRef: null }),
}));
