package lifefund

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// PushNotifier is satisfied by notifications.Service.
type PushNotifier interface {
	SendToUser(ctx context.Context, userID, title, body string, data map[string]string)
}

// ValidationError is returned for user-facing 4xx conditions (bad input,
// ineligibility, invalid state transitions) so the handler can respond with
// the right status code and message instead of a generic 500.
type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

func validationErrorf(format string, args ...interface{}) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

type Service struct {
	repo *Repository
	push PushNotifier
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetPushNotifier(p PushNotifier) {
	s.push = p
}

var validCategories = map[string]bool{
	CategoryHospitalBill: true, CategoryPharmacy: true, CategoryDiagnosticTest: true,
	CategoryConsultation: true, CategoryMedicalProcedure: true, CategoryHealthcareEquip: true, CategoryOther: true,
}

// ── Eligibility / account overview ─────────────────────────────────────────

// buildInput assembles an EligibilityInput for a user, optionally checking a
// candidate requested amount / bill reference (pass 0 / "" when just viewing
// the account, not submitting).
func (s *Service) buildInput(userID string, requestedAmount float64, billRef string) (Config, EligibilityInput, *Account, error) {
	cfg, err := s.repo.LoadConfig()
	if err != nil {
		return cfg, EligibilityInput{}, nil, err
	}
	acc, err := s.repo.EnsureAccount(userID)
	if err != nil {
		return cfg, EligibilityInput{}, nil, err
	}
	ageDays, hasIdentity, err := s.repo.UserProfile(userID)
	if err != nil {
		return cfg, EligibilityInput{}, nil, err
	}
	openCount, err := s.repo.CountOpenRequests(userID)
	if err != nil {
		return cfg, EligibilityInput{}, nil, err
	}
	since := time.Now().Add(-24 * time.Hour)
	last24h, err := s.repo.CountRequestsSince(userID, since)
	if err != nil {
		return cfg, EligibilityInput{}, nil, err
	}
	dup := false
	if billRef != "" {
		dup, err = s.repo.HasDuplicateBillReference(userID, billRef)
		if err != nil {
			return cfg, EligibilityInput{}, nil, err
		}
	}

	allowException := false
	if acc.AdminOverrideStatus != nil && *acc.AdminOverrideStatus == StatusEligible {
		allowException = true
	}

	in := EligibilityInput{
		AccountExists:          true,
		AccountStatus:          acc.Status,
		AdminOverrideStatus:    acc.AdminOverrideStatus,
		AdminOverrideAllowsNew: allowException,
		CreditLimit:            acc.CreditLimit,
		OutstandingBalance:     acc.OutstandingBalance,
		SuccessfulRepayments:   acc.SuccessfulRepayments,
		DefaultsCount:          acc.DefaultsCount,
		UserAccountAgeDays:     ageDays,
		HasBasicIdentity:       hasIdentity,
		RequestedAmount:        requestedAmount,
		OpenRequestsCount:      openCount,
		RequestsLast24h:        last24h,
		DuplicateBillRef:       dup,
	}
	return cfg, in, acc, nil
}

// GetAccountOverview evaluates and persists the patient's current LifeFund
// eligibility/limit, then returns the account. Safe to call every time the
// patient opens LifeFund — it never creates a request.
func (s *Service) GetAccountOverview(userID string) (*Account, EligibilityResult, error) {
	cfg, in, acc, err := s.buildInput(userID, 0, "")
	if err != nil {
		return nil, EligibilityResult{}, err
	}
	result := Evaluate(cfg, in)

	status := result.Status
	if !result.Eligible && (status == StatusLimited) {
		// Evaluate() only returns LIMITED in response to a specific amount;
		// with no amount requested, an otherwise-clear account is ELIGIBLE.
		status = StatusEligible
	}
	if err := s.repo.UpdateAccountState(userID, status, result.Reason, result.AvailableLimit,
		acc.OutstandingBalance, result.RiskScore, acc.SuccessfulRepayments, acc.DefaultsCount); err != nil {
		return nil, EligibilityResult{}, err
	}

	updated, err := s.repo.GetAccount(userID)
	if err != nil {
		return nil, EligibilityResult{}, err
	}
	return updated, result, nil
}

// ── Patient: submit / list / view ───────────────────────────────────────────

func (s *Service) SubmitRequest(ctx context.Context, userID string, in SubmitRequestInput) (*Request, error) {
	if !validCategories[in.ExpenseCategory] {
		return nil, validationErrorf("Unknown expense category %q.", in.ExpenseCategory)
	}
	if strings.TrimSpace(in.HealthcareProviderName) == "" {
		return nil, validationErrorf("Healthcare provider name is required.")
	}
	if in.RequestedAmount <= 0 {
		return nil, validationErrorf("Requested amount must be greater than zero.")
	}

	cfg, eligIn, _, err := s.buildInput(userID, in.RequestedAmount, in.BillReference)
	if err != nil {
		return nil, err
	}
	result := Evaluate(cfg, eligIn)
	if !result.Eligible {
		// Persist the reason so the account screen reflects why they were blocked.
		_ = s.repo.UpdateAccountState(userID, result.Status, result.Reason, result.AvailableLimit,
			eligIn.OutstandingBalance, result.RiskScore, eligIn.SuccessfulRepayments, eligIn.DefaultsCount)
		return nil, validationErrorf("%s", result.Reason)
	}

	id, err := s.repo.CreateRequest(userID, in, result.RiskScore, result.FraudFlags, cfg)
	if err != nil {
		return nil, err
	}

	if s.push != nil {
		s.push.SendToUser(ctx, userID, "LifeFund application received",
			"We've received your LifeFund request and it's now under review.", map[string]string{"type": "lifefund.application_received", "requestId": id})
	}

	return s.repo.GetRequest(id)
}

func (s *Service) ListMyRequests(userID string) ([]Request, error) {
	return s.repo.ListRequestsByUser(userID)
}

func (s *Service) GetRequestForUser(userID, requestID string) (*Request, error) {
	req, err := s.repo.GetRequest(requestID)
	if err != nil || req == nil {
		return req, err
	}
	if req.UserID != userID {
		return nil, validationErrorf("Request not found.")
	}
	req.Schedule, _ = s.repo.GetSchedule(requestID)
	req.Repayments, _ = s.repo.GetRepayments(requestID)
	return req, nil
}

// AcceptAgreement records the patient's explicit acceptance of the frozen
// agreement terms. Funds are disbursed by a separate, deliberate admin
// action (see AdminDisburse) — acceptance alone never moves money.
func (s *Service) AcceptAgreement(ctx context.Context, userID, requestID string) (*Request, error) {
	req, err := s.repo.GetRequest(requestID)
	if err != nil {
		return nil, err
	}
	if req == nil || req.UserID != userID {
		return nil, validationErrorf("Request not found.")
	}
	if req.Status != ReqAwaitingAcceptance {
		return nil, validationErrorf("This request is not awaiting acceptance.")
	}
	if err := s.repo.AcceptAgreement(requestID); err != nil {
		return nil, err
	}
	if s.push != nil {
		s.push.SendToUser(ctx, userID, "Financing terms accepted",
			"Your LifeFund agreement has been accepted. Disbursement is being processed.",
			map[string]string{"type": "lifefund.financing_accepted", "requestId": requestID})
	}
	return s.repo.GetRequest(requestID)
}

// ── Repayment ────────────────────────────────────────────────────────────

// RecordRepayment applies a payment (from Flutterwave webhook or an admin's
// manual entry) to the next unpaid installment, updates the request and
// account balances, and — when the request is now fully repaid — restores
// the account to ELIGIBLE and re-evaluates the dynamic limit tier.
func (s *Service) RecordRepayment(ctx context.Context, requestID string, in RecordRepaymentInput) (*Request, error) {
	req, err := s.repo.GetRequest(requestID)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, validationErrorf("Request not found.")
	}
	if req.Status != ReqActive && req.Status != ReqDisbursed && req.Status != ReqOverdue {
		return nil, validationErrorf("Request is not currently accruing repayments.")
	}
	if in.Amount <= 0 {
		return nil, validationErrorf("Repayment amount must be greater than zero.")
	}

	// First repayment on a DISBURSED request activates it.
	if req.Status == ReqDisbursed {
		if err := s.repo.SetRequestActive(requestID); err != nil {
			return nil, err
		}
	}

	inst, err := s.repo.NextUnpaidInstallment(requestID)
	if err != nil {
		return nil, err
	}
	var scheduleID *string
	if inst != nil {
		scheduleID = &inst.ID
		if _, err := s.repo.ApplyPaymentToInstallment(inst.ID, in.Amount); err != nil {
			return nil, err
		}
	}
	method := in.Method
	if method == "" {
		method = "flutterwave"
	}
	if _, err := s.repo.InsertRepayment(requestID, req.UserID, scheduleID, in.Amount, method, in.ProviderRef); err != nil {
		return nil, err
	}

	newOutstanding := req.OutstandingBalance - in.Amount
	if newOutstanding < 0 {
		newOutstanding = 0
	}
	if err := s.repo.UpdateRequestOutstanding(requestID, newOutstanding); err != nil {
		return nil, err
	}

	if s.push != nil {
		s.push.SendToUser(ctx, req.UserID, "Repayment received",
			fmt.Sprintf("We've received your LifeFund repayment of %.2f.", in.Amount),
			map[string]string{"type": "lifefund.repayment_successful", "requestId": requestID})
	}

	if newOutstanding <= 0 {
		if err := s.repo.CompleteRequest(requestID); err != nil {
			return nil, err
		}
		acc, err := s.repo.GetAccount(req.UserID)
		if err != nil {
			return nil, err
		}
		cfg, err := s.repo.LoadConfig()
		if err != nil {
			return nil, err
		}
		newLimit := effectiveLimit(cfg, acc.CreditLimit, acc.SuccessfulRepayments+1, acc.DefaultsCount)
		if err := s.repo.UpdateAccountState(req.UserID, StatusEligible,
			"LifeFund fully repaid — eligible for a new request.", newLimit, 0, acc.RiskScore,
			acc.SuccessfulRepayments+1, acc.DefaultsCount); err != nil {
			return nil, err
		}
		if s.push != nil {
			s.push.SendToUser(ctx, req.UserID, "LifeFund fully repaid",
				"Your LifeFund balance is fully repaid. You're eligible for a new request.",
				map[string]string{"type": "lifefund.account_fully_repaid", "requestId": requestID})
		}
	}

	return s.repo.GetRequest(requestID)
}

// RunOverdueSweep should be called periodically (e.g. every few hours). It
// flips past-due installments to OVERDUE, cascades the parent request, and
// pushes an overdue-payment notification to each affected patient.
func (s *Service) RunOverdueSweep(ctx context.Context) (int, error) {
	ids, err := s.repo.MarkOverdueInstallments()
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		req, err := s.repo.GetRequest(id)
		if err != nil || req == nil {
			continue
		}
		if s.push != nil {
			s.push.SendToUser(ctx, req.UserID, "LifeFund repayment overdue",
				"A LifeFund installment is now overdue. Please make a payment to avoid account restriction.",
				map[string]string{"type": "lifefund.overdue_payment", "requestId": id})
		}
	}
	return len(ids), nil
}

// ── Admin ────────────────────────────────────────────────────────────────

func (s *Service) DashboardSummary() (*DashboardSummary, error) {
	return s.repo.DashboardSummary()
}

func (s *Service) ListRequestsAdmin(f AdminListFilters) ([]Request, int, error) {
	return s.repo.ListRequestsAdmin(f)
}

// GetRequestAdminRaw fetches a request without its schedule/repayments —
// used to capture a lightweight "before" snapshot for audit logging.
func (s *Service) GetRequestAdminRaw(requestID string) (*Request, error) {
	return s.repo.GetRequest(requestID)
}

func (s *Service) GetRequestAdmin(requestID string) (*Request, []AuditEntry, error) {
	req, err := s.repo.GetRequest(requestID)
	if err != nil || req == nil {
		return req, nil, err
	}
	req.Schedule, _ = s.repo.GetSchedule(requestID)
	req.Repayments, _ = s.repo.GetRepayments(requestID)
	audit, err := s.repo.GetAuditTrail(requestID)
	return req, audit, err
}

// ApplyAdminAction dispatches one of the spec's admin actions (plus DISBURSE)
// against a request. Returns the updated request so the handler/audit call
// can capture a before/after snapshot.
func (s *Service) ApplyAdminAction(ctx context.Context, adminID, requestID string, in AdminActionInput) (*Request, error) {
	req, err := s.repo.GetRequest(requestID)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, validationErrorf("Request not found.")
	}

	switch in.Action {
	case ActionApprove:
		if req.Status != ReqPendingReview && req.Status != ReqMoreInfoRequired && req.Status != ReqEscalated {
			return nil, validationErrorf("Only a pending request can be approved.")
		}
		cfg, err := s.repo.LoadConfig()
		if err != nil {
			return nil, err
		}
		amount := req.RequestedAmount
		terms := buildAgreementTerms(cfg, amount)
		totalRepayable := terms.TotalRepaymentAmount
		if err := s.repo.ApproveRequest(requestID, adminID, in.Notes, amount, totalRepayable, terms); err != nil {
			return nil, err
		}
		if err := s.repo.InsertSchedule(requestID, buildSchedule(cfg, totalRepayable)); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "LifeFund request approved",
			"Your LifeFund request has been approved. Review and accept the financing terms to continue.",
			"lifefund.application_approved", requestID)

	case ActionReject:
		if req.Status != ReqPendingReview && req.Status != ReqMoreInfoRequired && req.Status != ReqEscalated {
			return nil, validationErrorf("Only a pending request can be rejected.")
		}
		if err := s.repo.SetRequestStatus(requestID, ReqRejected, adminID, in.Notes); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "LifeFund request declined",
			"Your LifeFund request was not approved. "+in.Notes, "lifefund.application_rejected", requestID)

	case ActionRequestMoreInfo:
		if err := s.repo.SetRequestStatus(requestID, ReqMoreInfoRequired, adminID, in.Notes); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "More information needed",
			"We need more information to process your LifeFund request. "+in.Notes,
			"lifefund.more_info_required", requestID)

	case ActionReduceAmount:
		if in.ReducedAmount == nil || *in.ReducedAmount <= 0 || *in.ReducedAmount >= req.RequestedAmount {
			return nil, validationErrorf("Reduced amount must be greater than zero and less than the requested amount.")
		}
		if err := s.repo.ReduceRequestAmount(requestID, adminID, in.Notes, *in.ReducedAmount); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "LifeFund amount adjusted",
			fmt.Sprintf("Your requested amount was adjusted to %.2f. %s", *in.ReducedAmount, in.Notes),
			"lifefund.amount_reduced", requestID)

	case ActionSuspend:
		if err := s.repo.SetRequestStatus(requestID, ReqRejected, adminID, in.Notes); err != nil {
			return nil, err
		}
		status := StatusSuspended
		if err := s.repo.SetAdminOverride(req.UserID, adminID, &status, in.Notes); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "LifeFund account suspended",
			"Your LifeFund account has been suspended. "+in.Notes, "lifefund.account_restricted", requestID)

	case ActionEscalate:
		if err := s.repo.SetRequestStatus(requestID, ReqEscalated, adminID, in.Notes); err != nil {
			return nil, err
		}

	case ActionMarkForProviderReview:
		if err := s.repo.SetRequestStatus(requestID, ReqEscalated, adminID, in.Notes); err != nil {
			return nil, err
		}

	case ActionRestructure:
		newInstallments := req.InstallmentsCount
		if in.NewInstallments != nil && *in.NewInstallments > 0 {
			newInstallments = *in.NewInstallments
		}
		if err := s.repo.SetRequestStatus(requestID, ReqRestructured, adminID, in.Notes); err != nil {
			return nil, err
		}
		_ = newInstallments // restructuring the live schedule is provider-specific; recorded via notes/status for now.
		if in.AllowException {
			eligible := StatusEligible
			if err := s.repo.SetAdminOverride(req.UserID, adminID, &eligible, "Restructuring exception: "+in.Notes); err != nil {
				return nil, err
			}
		}

	case ActionDisburse:
		if req.Status != ReqAccepted {
			return nil, validationErrorf("Funds can only be disbursed after the patient accepts the agreement.")
		}
		if err := s.repo.MarkDisbursed(requestID, adminID, in.Notes); err != nil {
			return nil, err
		}
		s.notify(ctx, req.UserID, "LifeFund disbursed",
			"Your LifeFund financing has been disbursed to your healthcare provider.",
			"lifefund.disbursement", requestID)

	default:
		return nil, validationErrorf("Unknown admin action %q.", in.Action)
	}

	return s.repo.GetRequest(requestID)
}

func (s *Service) notify(ctx context.Context, userID, title, body, eventType, requestID string) {
	if s.push == nil {
		return
	}
	s.push.SendToUser(ctx, userID, title, body, map[string]string{"type": eventType, "requestId": requestID})
}

// ── Agreement / schedule construction ───────────────────────────────────────

func buildAgreementTerms(cfg Config, principal float64) AgreementTerms {
	chargeAmount := principal * cfg.InterestRatePct / 100
	total := principal + chargeAmount + cfg.FlatFee
	first := time.Now().AddDate(0, 0, cfg.RepaymentFrequencyDays)
	final := time.Now().AddDate(0, 0, cfg.RepaymentFrequencyDays*cfg.DefaultInstallments)
	return AgreementTerms{
		AmountFinanced:         principal,
		FinancingChargePct:     cfg.InterestRatePct,
		FinancingChargeAmount:  chargeAmount,
		FeeAmount:              cfg.FlatFee,
		TotalRepaymentAmount:   total,
		RepaymentFrequencyDays: cfg.RepaymentFrequencyDays,
		InstallmentsCount:      cfg.DefaultInstallments,
		FirstRepaymentDate:     first.Format("2006-01-02"),
		FinalRepaymentDate:     final.Format("2006-01-02"),
		LatePaymentConsequence: "A missed due date marks the installment overdue, may raise your risk score, and can restrict future LifeFund access until the balance is cleared.",
		CoolingOffHours:        cfg.CoolingOffHours,
		ComplaintProcess:       "Contact LifeGate Support in-app or at support@lifegate.health to raise a complaint about this financing agreement.",
		FinancingProvider:      "LifeGate LifeFund",
		TermsAndConditions:     "By accepting, you agree to repay the total repayment amount above according to the installment schedule shown. LifeFund is a financing facility, not a grant.",
	}
}

func buildSchedule(cfg Config, totalRepayable float64) []RepaymentInstallment {
	n := cfg.DefaultInstallments
	if n < 1 {
		n = 1
	}
	perInstallment := roundMoney(totalRepayable / float64(n))
	var out []RepaymentInstallment
	running := 0.0
	for i := 1; i <= n; i++ {
		amount := perInstallment
		if i == n {
			amount = roundMoney(totalRepayable - running) // last installment absorbs rounding remainder
		}
		running += amount
		due := time.Now().AddDate(0, 0, cfg.RepaymentFrequencyDays*i)
		out = append(out, RepaymentInstallment{
			InstallmentNo: i,
			DueDate:       due.Format("2006-01-02"),
			AmountDue:     amount,
		})
	}
	return out
}

func roundMoney(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}
