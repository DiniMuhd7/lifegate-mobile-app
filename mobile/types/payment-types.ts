// Types for Payments & Credits feature

export type PaymentCurrency = 'NGN' | 'USD';

export interface CreditBundle {
  id: string;
  amountNaira: number;
  amountUSD: number;
  credits: number;
  label: string;
  labelUSD: string;
}

export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface PaymentTransaction {
  id: string;
  userId: string;
  txRef: string;
  flwTxId?: string;
  amount: number;
  currency: PaymentCurrency;
  creditsGranted: number;
  status: PaymentStatus;
  bundleId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditBalance {
  userId: string;
  balance: number;
  updatedAt: string;
}

export interface InitiatePaymentResponse {
  txRef: string;
  paymentLink: string;
}

export interface VerifyPaymentResponse {
  transaction: PaymentTransaction;
}

export interface TransactionLogResponse {
  transactions: PaymentTransaction[];
  total: number;
}

export interface CreditDeduction {
  id: string;
  userId: string;
  diagnosisId: string;
  amount: number;
  createdAt: string;
}

export interface CreditDeductionLogResponse {
  deductions: CreditDeduction[];
  total: number;
}

// Deep-link callback params from Flutterwave redirect
export interface FlutterwaveCallbackParams {
  status: 'successful' | 'cancelled' | 'failed';
  tx_ref: string;
  transaction_id?: string;
}
