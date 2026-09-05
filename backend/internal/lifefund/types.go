// Package lifefund implements LifeFund: a healthcare financing/loan
// facility for LifeGate patients. It is NOT a free-credit system — every
// request that gets disbursed carries a principal, a financing charge,
// a repayment schedule, and a full audit trail (via internal/audit).
//
// Layout mirrors the rest of the backend: types.go (this file) holds the
// shared data shapes, repository.go is the only file that touches SQL,
// eligibility.go is the standalone eligibility/risk engine, service.go
// holds business logic, and handler.go exposes it over HTTP.
package lifefund

import "time"

// Account statuses. Configurable states as specified by the product spec.
const (
	StatusEligible      = "ELIGIBLE"
	StatusPendingReview = "PENDING_REVIEW"
	StatusLimited       = "LIMITED"
	StatusRestricted    = "RESTRICTED"
	StatusSuspended     = "SUSPENDED"
	StatusDefaulted     = "DEFAULTED"
	StatusIneligible    = "INELIGIBLE"
)

// Request lifecycle statuses.
const (
	ReqPendingReview      = "PENDING_REVIEW"
	ReqMoreInfoRequired   = "MORE_INFO_REQUIRED"
	ReqApproved           = "APPROVED"
	ReqRejected           = "REJECTED"
	ReqAwaitingAcceptance = "AWAITING_ACCEPTANCE"
	ReqAccepted           = "ACCEPTED"
	ReqDisbursed          = "DISBURSED"
	ReqActive             = "ACTIVE"
	ReqCompleted          = "COMPLETED"
	ReqOverdue            = "OVERDUE"
	ReqDefaulted          = "DEFAULTED"
	ReqCancelled          = "CANCELLED"
	ReqEscalated          = "ESCALATED"
	ReqRestructured       = "RESTRUCTURED"
)

// Admin actions on a request, as specified by the product spec (plus
// DISBURSE, which the workflow requires as a distinct, deliberate step
// after the patient accepts the agreement).
const (
	ActionApprove             = "APPROVE"
	ActionReject              = "REJECT"
	ActionRequestMoreInfo     = "REQUEST_MORE_INFORMATION"
	ActionReduceAmount        = "REDUCE_AMOUNT"
	ActionSuspend             = "SUSPEND"
	ActionEscalate            = "ESCALATE"
	ActionRestructure         = "RESTRUCTURE"
	ActionMarkForProviderReview = "MARK_FOR_PROVIDER_REVIEW"
	ActionDisburse            = "DISBURSE"
)

// Expense categories LifeFund can finance.
const (
	CategoryHospitalBill      = "HOSPITAL_BILL"
	CategoryPharmacy          = "PHARMACY"
	CategoryDiagnosticTest    = "DIAGNOSTIC_TEST"
	CategoryConsultation      = "CONSULTATION"
	CategoryMedicalProcedure  = "MEDICAL_PROCEDURE"
	CategoryHealthcareEquip   = "HEALTHCARE_EQUIPMENT"
	CategoryOther             = "OTHER"
)

// Document is a single uploaded supporting document reference.
type Document struct {
	URL        string    `json:"url"`
	Name       string    `json:"name"`
	UploadedAt time.Time `json:"uploadedAt"`
}

// FraudFlag is one raised fraud/risk indicator.
type FraudFlag struct {
	Code      string    `json:"code"`
	Detail    string    `json:"detail"`
	FlaggedAt time.Time `json:"flaggedAt"`
}

// Account is a patient's LifeFund account state.
type Account struct {
	UserID                 string     `json:"userId"`
	Status                 string     `json:"status"`
	CreditLimit            float64    `json:"creditLimit"`
	OutstandingBalance     float64    `json:"outstandingBalance"`
	AvailableLimit         float64    `json:"availableLimit"` // creditLimit - outstandingBalance, floored at 0
	SuccessfulRepayments   int        `json:"successfulRepayments"`
	DefaultsCount          int        `json:"defaultsCount"`
	RiskScore              float64    `json:"riskScore"`
	LastEligibilityReason  string     `json:"lastEligibilityReason"`
	AdminOverrideStatus    *string    `json:"adminOverrideStatus,omitempty"`
	AdminOverrideReason    string     `json:"adminOverrideReason,omitempty"`
	CreatedAt              time.Time  `json:"createdAt"`
	UpdatedAt              time.Time  `json:"updatedAt"`
}

// RepaymentInstallment is one line of a request's repayment schedule.
type RepaymentInstallment struct {
	ID             string     `json:"id"`
	RequestID      string     `json:"requestId"`
	InstallmentNo  int        `json:"installmentNo"`
	DueDate        string     `json:"dueDate"` // YYYY-MM-DD
	AmountDue      float64    `json:"amountDue"`
	AmountPaid     float64    `json:"amountPaid"`
	Status         string     `json:"status"`
	PaidAt         *time.Time `json:"paidAt,omitempty"`
}

// Repayment is one recorded payment event against a request.
type Repayment struct {
	ID          string    `json:"id"`
	RequestID   string    `json:"requestId"`
	ScheduleID  *string   `json:"scheduleId,omitempty"`
	Amount      float64   `json:"amount"`
	Method      string    `json:"method"`
	ProviderRef string    `json:"providerRef"`
	Status      string    `json:"status"`
	PaidAt      time.Time `json:"paidAt"`
}

// AgreementTerms is the frozen set of terms shown to (and accepted by) the
// patient before disbursement. Nothing here may be hidden or changed after
// the patient accepts.
type AgreementTerms struct {
	AmountFinanced        float64  `json:"amountFinanced"`
	FinancingChargePct    float64  `json:"financingChargePct"`
	FinancingChargeAmount float64  `json:"financingChargeAmount"`
	FeeAmount             float64  `json:"feeAmount"`
	TotalRepaymentAmount  float64  `json:"totalRepaymentAmount"`
	RepaymentFrequencyDays int     `json:"repaymentFrequencyDays"`
	InstallmentsCount     int      `json:"installmentsCount"`
	FirstRepaymentDate    string   `json:"firstRepaymentDate"`
	FinalRepaymentDate    string   `json:"finalRepaymentDate"`
	LatePaymentConsequence string  `json:"latePaymentConsequence"`
	CoolingOffHours       int      `json:"coolingOffHours"`
	ComplaintProcess      string   `json:"complaintProcess"`
	FinancingProvider     string   `json:"financingProvider"`
	TermsAndConditions    string   `json:"termsAndConditions"`
}

// Request is a single LifeFund financing request/loan.
type Request struct {
	ID                        string          `json:"id"`
	UserID                    string          `json:"userId"`
	PatientName               string          `json:"patientName,omitempty"`
	PatientEmail              string          `json:"patientEmail,omitempty"`
	PatientPhone              string          `json:"patientPhone,omitempty"`

	ExpenseCategory           string          `json:"expenseCategory"`
	PurposeDescription        string          `json:"purposeDescription"`

	HealthcareProviderName    string          `json:"healthcareProviderName"`
	HealthcareProviderAccount string          `json:"healthcareProviderAccount"`
	BillReference             string          `json:"billReference"`
	SupportingDocuments       []Document      `json:"supportingDocuments"`

	RequestedAmount           float64         `json:"requestedAmount"`
	ApprovedAmount            *float64        `json:"approvedAmount,omitempty"`
	FinancingProvider         string          `json:"financingProvider"`

	InterestRatePct           float64         `json:"interestRatePct"`
	FeeAmount                 float64         `json:"feeAmount"`
	TotalRepayable            *float64        `json:"totalRepayable,omitempty"`
	OutstandingBalance        float64         `json:"outstandingBalance"`

	RepaymentFrequencyDays    int             `json:"repaymentFrequencyDays"`
	InstallmentsCount         int             `json:"installmentsCount"`
	FirstRepaymentDate        *string         `json:"firstRepaymentDate,omitempty"`
	FinalRepaymentDate        *string         `json:"finalRepaymentDate,omitempty"`

	RiskScore                 float64         `json:"riskScore"`
	FraudFlags                []FraudFlag     `json:"fraudFlags"`

	Status                    string          `json:"status"`
	AdminNotes                string          `json:"adminNotes"`
	ReviewedBy                *string         `json:"reviewedBy,omitempty"`
	ReviewedAt                *time.Time      `json:"reviewedAt,omitempty"`

	AgreementTerms            *AgreementTerms `json:"agreementTerms,omitempty"`
	AgreementAcceptedAt       *time.Time      `json:"agreementAcceptedAt,omitempty"`
	DisbursedAt               *time.Time      `json:"disbursedAt,omitempty"`
	CompletedAt               *time.Time      `json:"completedAt,omitempty"`

	CreatedAt                 time.Time       `json:"createdAt"`
	UpdatedAt                 time.Time       `json:"updatedAt"`

	Schedule                  []RepaymentInstallment `json:"schedule,omitempty"`
	Repayments                []Repayment            `json:"repayments,omitempty"`
}

// SubmitRequestInput is what a patient submits to open a new request.
type SubmitRequestInput struct {
	ExpenseCategory           string     `json:"expenseCategory" binding:"required"`
	PurposeDescription        string     `json:"purposeDescription"`
	HealthcareProviderName    string     `json:"healthcareProviderName" binding:"required"`
	HealthcareProviderAccount string     `json:"healthcareProviderAccount"`
	BillReference             string     `json:"billReference"`
	RequestedAmount           float64    `json:"requestedAmount" binding:"required"`
	SupportingDocuments       []Document `json:"supportingDocuments"`
}

// AdminActionInput is what an admin submits when acting on a request.
type AdminActionInput struct {
	Action         string   `json:"action" binding:"required"`
	Notes          string   `json:"notes"`
	ReducedAmount  *float64 `json:"reducedAmount,omitempty"`  // used with REDUCE_AMOUNT
	NewInstallments *int    `json:"newInstallments,omitempty"` // used with RESTRUCTURE
	AllowException bool     `json:"allowException"`            // permits a new request despite an outstanding balance (RESTRUCTURE) or clears a block
}

// RecordRepaymentInput is used both by a patient-initiated payment callback
// and by an admin manually recording an offline repayment.
type RecordRepaymentInput struct {
	Amount      float64 `json:"amount" binding:"required"`
	Method      string  `json:"method"`
	ProviderRef string  `json:"providerRef"`
	ScheduleID  *string `json:"scheduleId,omitempty"`
}

// EligibilityResult is the output of the eligibility engine.
type EligibilityResult struct {
	Status         string      `json:"status"`
	Eligible       bool        `json:"eligible"` // true only for ELIGIBLE / LIMITED (request may proceed)
	Reason         string      `json:"reason"`
	AvailableLimit float64     `json:"availableLimit"`
	RiskScore      float64     `json:"riskScore"`
	FraudFlags     []FraudFlag `json:"fraudFlags"`
	RequiresAdminReview bool   `json:"requiresAdminReview"`
}

// DashboardSummary powers the admin LifeFund overview.
type DashboardSummary struct {
	NewRequests         int     `json:"newRequests"` // PENDING_REVIEW, created in last 24h
	PendingReview       int     `json:"pendingReview"`
	Approved            int     `json:"approved"`
	Rejected            int     `json:"rejected"`
	Disbursed           int     `json:"disbursed"`
	Active              int     `json:"active"`
	FullyRepaid         int     `json:"fullyRepaid"`
	Overdue             int     `json:"overdue"`
	Defaulted           int     `json:"defaulted"`
	FraudFlagged        int     `json:"fraudFlagged"`
	TotalOutstanding    float64 `json:"totalOutstanding"`
	TotalDisbursedAmount float64 `json:"totalDisbursedAmount"`
}

// AuditEntry mirrors the shape returned from the shared audit_events table,
// scoped to a single LifeFund request.
type AuditEntry struct {
	ID        string      `json:"id"`
	ActorID   *string     `json:"actorId,omitempty"`
	ActorRole string      `json:"actorRole"`
	EventType string      `json:"eventType"`
	OldValue  interface{} `json:"oldValue,omitempty"`
	NewValue  interface{} `json:"newValue,omitempty"`
	Metadata  interface{} `json:"metadata,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
}
