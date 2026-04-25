import api from './api';
import type {
  CreditBalance,
  CreditBundle,
  InitiatePaymentResponse,
  PaymentCurrency,
  PaymentTransaction,
  TransactionLogResponse,
} from 'types/payment-types';

export const PaymentService = {
  /**
   * Fetch all available credit bundles.
   * GET /payments/bundles
   */
  async getBundles(): Promise<CreditBundle[]> {
    const res = await api.get<{ success: boolean; data: CreditBundle[] }>('/payments/bundles');
    if (!res.data.success) throw new Error('Failed to fetch bundles');
    return res.data.data ?? [];
  },

  /**
   * Fetch the authenticated patient's credit balance.
   * GET /credits/balance
   */
  async getCreditBalance(): Promise<CreditBalance> {
    const res = await api.get<{ success: boolean; data: CreditBalance }>('/credits/balance');
    if (!res.data.success) throw new Error('Failed to fetch balance');
    return res.data.data;
  },

  /**
   * Initiate a Flutterwave payment for a bundle.
   * POST /payments/initiate
   */
  async initiatePayment(
    bundleId: string,
    name?: string,
    currency: PaymentCurrency = 'NGN'
  ): Promise<InitiatePaymentResponse> {
    const res = await api.post<{ success: boolean; data: InitiatePaymentResponse }>(
      '/payments/initiate',
      { bundleId, name, currency }
    );
    if (!res.data.success) throw new Error('Failed to initiate payment');
    return res.data.data;
  },

  /**
   * Verify a completed Flutterwave payment and credit the user.
   * POST /payments/verify
   *
   * Returns the transaction regardless of status (success | pending | failed).
   * HTTP 402 (failed) is caught so callers always get transaction data rather
   * than a thrown error — callers are responsible for inspecting tx.status.
   */
  async verifyPayment(txRef: string, flwTxId: string): Promise<PaymentTransaction> {
    try {
      const res = await api.post<{ success: boolean; data: PaymentTransaction }>(
        '/payments/verify',
        { txRef, flwTxId }
      );
      return res.data.data;
    } catch (err: unknown) {
      // Backend returns HTTP 402 with transaction data when the payment failed.
      // Extract it so callers can inspect status instead of always throwing.
      const axiosErr = err as { response?: { data?: { data?: PaymentTransaction } } };
      if (axiosErr?.response?.data?.data) {
        return axiosErr.response.data.data;
      }
      throw err;
    }
  },

  /**
   * Fetch the authenticated user's payment transaction history.
   * GET /payments/transactions
   */
  async getTransactions(limit = 50): Promise<TransactionLogResponse> {
    const res = await api.get<{ success: boolean; data: TransactionLogResponse }>(
      '/payments/transactions',
      { params: { limit } }
    );
    if (!res.data.success) throw new Error('Failed to fetch transactions');
    return res.data.data;
  },
};
