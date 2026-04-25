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
   */
  async verifyPayment(txRef: string, flwTxId: string): Promise<PaymentTransaction> {
    const res = await api.post<{ success: boolean; data: PaymentTransaction }>(
      '/payments/verify',
      { txRef, flwTxId }
    );
    // Return the transaction regardless of status — caller decides what to show.
    return res.data.data;
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
