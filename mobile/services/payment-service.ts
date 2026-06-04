import api from './api';
import type {
  CreditBalance,
  CreditBundle,
  CreditDeduction,
  CreditDeductionLogResponse,
  InitiatePaymentResponse,
  PaymentCurrency,
  PaymentTransaction,
  TransactionLogResponse,
  StreakInfo,
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
    // Always use HTTPS redirect URL — payment gateways require HTTPS redirect targets.
    // The server callback page then handles returning the user to the app via deep-link.
    const redirectUrl = 'https://edis.dshub.com.ng/payment-callback';

    const res = await api.post<{ success: boolean; data: InitiatePaymentResponse }>(
      '/payments/initiate',
      { bundleId, name, currency, redirectUrl }
    );
    if (!res.data.success) throw new Error('Failed to initiate payment');
    return res.data.data;
  },

  /**
   * Verify a completed Flutterwave payment and credit the user.
   * POST /payments/verify
   *
   * Returns the transaction regardless of status (success | pending | failed).
   * FIX #5: Robust 402/202 error handling — validates response structure before extraction.
   */
  async verifyPayment(txRef: string, flwTxId: string): Promise<PaymentTransaction> {
    try {
      const res = await api.post<{ success: boolean; data: PaymentTransaction }>(
        '/payments/verify',
        { txRef, flwTxId }
      );
      return res.data.data;
    } catch (err: unknown) {
      // FIX #5: Handle HTTP 402 failure payment response + HTTP 202 pending response
      // Backend returns 402/202 with transaction data when payment failed/pending.
      const axiosErr = err as { response?: { status?: number; data?: { data?: PaymentTransaction } } };
      
      // Validate status code and response structure before extraction
      if (axiosErr?.response?.status === 402 && axiosErr?.response?.data?.data) {
        const tx = axiosErr.response.data.data;
        // Ensure it's a valid PaymentTransaction with status field
        if (tx && typeof tx === 'object' && 'status' in tx) {
          return tx as PaymentTransaction;
        }
      }
      
      // FIX #5: Handle HTTP 202 (Accepted/pending) response
      if (axiosErr?.response?.status === 202 && axiosErr?.response?.data?.data) {
        const tx = axiosErr.response.data.data;
        if (tx && typeof tx === 'object' && 'status' in tx) {
          return tx as PaymentTransaction;
        }
      }
      
      // Re-throw if we can't extract transaction data
      throw err;
    }
  },

  /**
   * Poll transaction status from the DB without calling Flutterwave.
   * GET /payments/tx-status?txRef=...
   *
   * Returns the transaction regardless of status.
   * HTTP 200 → status='success' (webhook already credited)
   * HTTP 202 → status='pending'|'failed' (webhook not yet arrived)
   */
  async getTxStatus(txRef: string): Promise<PaymentTransaction> {
    try {
      const res = await api.get<{ success: boolean; data: PaymentTransaction }>(
        '/payments/tx-status',
        { params: { txRef } }
      );
      return res.data.data;
    } catch (err: unknown) {
      // 202 is returned as an Axios error when validateStatus is strict.
      const axiosErr = err as { response?: { status?: number; data?: { data?: PaymentTransaction } } };
      if (axiosErr?.response?.status === 202 && axiosErr?.response?.data?.data) {
        const tx = axiosErr.response.data.data;
        if (tx && typeof tx === 'object' && 'status' in tx) {
          return tx as PaymentTransaction;
        }
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

  /**
   * Fetch the authenticated user's DX credit deduction history.
   * GET /credits/deductions
   */
  async getCreditDeductions(limit = 100): Promise<CreditDeductionLogResponse> {
    const res = await api.get<{ success: boolean; data: CreditDeductionLogResponse }>(
      '/credits/deductions',
      { params: { limit } }
    );
    if (!res.data.success) throw new Error('Failed to fetch credit deductions');
    return res.data.data;
  },

  /**
   * Spend the patient's LifeCoins to unlock one DX credit (with prior consent).
   * POST /lifecoins/use-for-dx
   *
   * Returns the number of LifeCoins deducted. Throws when balance is
   * insufficient (HTTP 402) or on server error.
   */
  async spendLifecoinsForDx(): Promise<{ coinsDeducted: number }> {
    const res = await api.post<{ success: boolean; data: { coinsDeducted: number } }>(
      '/lifecoins/use-for-dx'
    );
    if (!res.data.success) throw new Error('Failed to spend LifeCoins for Dx Credit');
    return res.data.data;
  },

  /** Fetch the authenticated patient's check-in streak from the server. */
  async getStreak(): Promise<StreakInfo> {
    const res = await api.get<{ success: boolean; data: StreakInfo }>('/lifecoins/streak');
    return res.data.data;
  },
};
