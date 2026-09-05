// Types for the LifeFund healthcare financing/loan feature.
// Mirrors backend/internal/lifefund/types.go — keep in sync.

export type LifeFundAccountStatus =
  | 'ELIGIBLE'
  | 'PENDING_REVIEW'
  | 'LIMITED'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'DEFAULTED'
  | 'INELIGIBLE';

export type LifeFundRequestStatus =
  | 'PENDING_REVIEW'
  | 'MORE_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'AWAITING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DISBURSED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'DEFAULTED'
  | 'CANCELLED'
  | 'ESCALATED'
  | 'RESTRUCTURED';

export type LifeFundExpenseCategory =
  | 'HOSPITAL_BILL'
  | 'PHARMACY'
  | 'DIAGNOSTIC_TEST'
  | 'CONSULTATION'
  | 'MEDICAL_PROCEDURE'
  | 'HEALTHCARE_EQUIPMENT'
  | 'OTHER';

export const LIFEFUND_CATEGORY_LABELS: Record<LifeFundExpenseCategory, string> = {
  HOSPITAL_BILL: 'Hospital bill',
  PHARMACY: 'Pharmacy purchase',
  DIAGNOSTIC_TEST: 'Diagnostic test',
  CONSULTATION: 'Medical consultation',
  MEDICAL_PROCEDURE: 'Medical procedure',
  HEALTHCARE_EQUIPMENT: 'Healthcare equipment',
  OTHER: 'Other eligible healthcare expense',
};

export type LifeFundAdminAction =
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_MORE_INFORMATION'
  | 'REDUCE_AMOUNT'
  | 'SUSPEND'
  | 'ESCALATE'
  | 'RESTRUCTURE'
  | 'MARK_FOR_PROVIDER_REVIEW'
  | 'DISBURSE';

export interface LifeFundDocument {
  url: string;
  name: string;
  uploadedAt: string;
}

export interface LifeFundFraudFlag {
  code: string;
  detail: string;
  flaggedAt: string;
}

export interface LifeFundAccount {
  userId: string;
  status: LifeFundAccountStatus;
  creditLimit: number;
  outstandingBalance: number;
  availableLimit: number;
  successfulRepayments: number;
  defaultsCount: number;
  riskScore: number;
  lastEligibilityReason: string;
  adminOverrideStatus?: LifeFundAccountStatus;
  adminOverrideReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifeFundEligibility {
  status: LifeFundAccountStatus;
  eligible: boolean;
  reason: string;
  availableLimit: number;
  riskScore: number;
  fraudFlags: LifeFundFraudFlag[];
  requiresAdminReview: boolean;
}

export interface LifeFundAgreementTerms {
  amountFinanced: number;
  financingChargePct: number;
  financingChargeAmount: number;
  feeAmount: number;
  totalRepaymentAmount: number;
  repaymentFrequencyDays: number;
  installmentsCount: number;
  firstRepaymentDate: string;
  finalRepaymentDate: string;
  latePaymentConsequence: string;
  coolingOffHours: number;
  complaintProcess: string;
  financingProvider: string;
  termsAndConditions: string;
}

export interface LifeFundInstallment {
  id: string;
  requestId: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'OVERDUE';
  paidAt?: string;
}

export interface LifeFundRepayment {
  id: string;
  requestId: string;
  scheduleId?: string;
  amount: number;
  method: string;
  providerRef: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  paidAt: string;
}

export interface LifeFundRequest {
  id: string;
  userId: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;

  expenseCategory: LifeFundExpenseCategory;
  purposeDescription: string;

  healthcareProviderName: string;
  healthcareProviderAccount: string;
  billReference: string;
  supportingDocuments: LifeFundDocument[];

  requestedAmount: number;
  approvedAmount?: number;
  financingProvider: string;

  interestRatePct: number;
  feeAmount: number;
  totalRepayable?: number;
  outstandingBalance: number;

  repaymentFrequencyDays: number;
  installmentsCount: number;
  firstRepaymentDate?: string;
  finalRepaymentDate?: string;

  riskScore: number;
  fraudFlags: LifeFundFraudFlag[];

  status: LifeFundRequestStatus;
  adminNotes: string;
  reviewedBy?: string;
  reviewedAt?: string;

  agreementTerms?: LifeFundAgreementTerms;
  agreementAcceptedAt?: string;
  disbursedAt?: string;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;

  schedule?: LifeFundInstallment[];
  repayments?: LifeFundRepayment[];
}

export interface SubmitLifeFundRequestInput {
  expenseCategory: LifeFundExpenseCategory;
  purposeDescription?: string;
  healthcareProviderName: string;
  healthcareProviderAccount?: string;
  billReference?: string;
  requestedAmount: number;
  supportingDocuments?: LifeFundDocument[];
}

export interface LifeFundAdminActionInput {
  action: LifeFundAdminAction;
  notes?: string;
  reducedAmount?: number;
  newInstallments?: number;
  allowException?: boolean;
}

export interface LifeFundDashboardSummary {
  newRequests: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  disbursed: number;
  active: number;
  fullyRepaid: number;
  overdue: number;
  defaulted: number;
  fraudFlagged: number;
  totalOutstanding: number;
  totalDisbursedAmount: number;
}

export interface LifeFundAuditEntry {
  id: string;
  actorId?: string;
  actorRole: string;
  eventType: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  createdAt: string;
}
