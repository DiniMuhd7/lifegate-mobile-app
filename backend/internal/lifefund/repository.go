package lifefund

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ── Config ───────────────────────────────────────────────────────────────

// LoadConfig reads every 'lifefund' category row from alert_thresholds.
// Missing rows silently fall back to the packaged defaults so a partially
// seeded environment never hard-fails the eligibility engine.
func (r *Repository) LoadConfig() (Config, error) {
	cfg := defaultConfig()
	rows, err := r.db.Query(`SELECT key, value FROM alert_thresholds WHERE category = 'lifefund'`)
	if err != nil {
		return cfg, err
	}
	defer rows.Close()

	values := map[string]float64{}
	for rows.Next() {
		var key string
		var val float64
		if err := rows.Scan(&key, &val); err != nil {
			return cfg, err
		}
		values[key] = val
	}

	if v, ok := values["lifefund.initial_limit"]; ok {
		cfg.InitialLimit = v
	}
	if v, ok := values["lifefund.tier2_limit"]; ok {
		cfg.Tier2Limit = v
	}
	if v, ok := values["lifefund.tier2_repayments_required"]; ok {
		cfg.Tier2RepaymentsRequired = int(v)
	}
	if v, ok := values["lifefund.tier3_limit"]; ok {
		cfg.Tier3Limit = v
	}
	if v, ok := values["lifefund.tier3_repayments_required"]; ok {
		cfg.Tier3RepaymentsRequired = int(v)
	}
	if v, ok := values["lifefund.interest_rate_pct"]; ok {
		cfg.InterestRatePct = v
	}
	if v, ok := values["lifefund.flat_fee"]; ok {
		cfg.FlatFee = v
	}
	if v, ok := values["lifefund.default_installments"]; ok {
		cfg.DefaultInstallments = int(v)
	}
	if v, ok := values["lifefund.repayment_frequency_days"]; ok {
		cfg.RepaymentFrequencyDays = int(v)
	}
	if v, ok := values["lifefund.min_account_age_days"]; ok {
		cfg.MinAccountAgeDays = int(v)
	}
	if v, ok := values["lifefund.max_requested_amount"]; ok {
		cfg.MaxRequestedAmount = v
	}
	if v, ok := values["lifefund.auto_review_risk_threshold"]; ok {
		cfg.AutoReviewRiskThreshold = v
	}
	if v, ok := values["lifefund.max_defaults_before_suspend"]; ok {
		cfg.MaxDefaultsBeforeSuspend = int(v)
	}
	if v, ok := values["lifefund.cooling_off_hours"]; ok {
		cfg.CoolingOffHours = int(v)
	}
	if v, ok := values["lifefund.auto_tier_upgrade_enabled"]; ok {
		cfg.AutoTierUpgradeEnabled = v != 0
	}
	return cfg, nil
}

// ── Account ──────────────────────────────────────────────────────────────

func scanAccount(row interface{ Scan(...interface{}) error }) (*Account, error) {
	var a Account
	var override sql.NullString
	if err := row.Scan(
		&a.UserID, &a.Status, &a.CreditLimit, &a.OutstandingBalance,
		&a.SuccessfulRepayments, &a.DefaultsCount, &a.RiskScore,
		&a.LastEligibilityReason, &override, &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if override.Valid {
		v := override.String
		a.AdminOverrideStatus = &v
	}
	a.AvailableLimit = a.CreditLimit - a.OutstandingBalance
	if a.AvailableLimit < 0 {
		a.AvailableLimit = 0
	}
	return &a, nil
}

const accountCols = `user_id, status, credit_limit, outstanding_balance,
	successful_repayments, defaults_count, risk_score, last_eligibility_reason,
	admin_override_status, created_at, updated_at`

// GetAccount returns nil, nil if the account has never been created.
func (r *Repository) GetAccount(userID string) (*Account, error) {
	row := r.db.QueryRow(`SELECT `+accountCols+` FROM lifefund_accounts WHERE user_id = $1::uuid`, userID)
	acc, err := scanAccount(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return acc, err
}

// EnsureAccount creates the account row on first touch with a zeroed-out
// (INELIGIBLE, no limit) state — the service layer immediately runs the
// eligibility engine to bring it up to date.
func (r *Repository) EnsureAccount(userID string) (*Account, error) {
	if acc, err := r.GetAccount(userID); err != nil {
		return nil, err
	} else if acc != nil {
		return acc, nil
	}
	_, err := r.db.Exec(`INSERT INTO lifefund_accounts (user_id) VALUES ($1::uuid)
		ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return nil, err
	}
	return r.GetAccount(userID)
}

// UpdateAccountState persists the outcome of an eligibility evaluation.
func (r *Repository) UpdateAccountState(userID, status, reason string, limit, outstanding, risk float64, successfulRepayments, defaults int) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_accounts SET
			status = $2, last_eligibility_reason = $3, credit_limit = $4,
			outstanding_balance = $5, risk_score = $6,
			successful_repayments = $7, defaults_count = $8, updated_at = NOW()
		WHERE user_id = $1::uuid`,
		userID, status, reason, limit, outstanding, risk, successfulRepayments, defaults)
	return err
}

// SetAdminOverride lets an admin force an account status (e.g. SUSPENDED,
// or clearing a restriction) with a reason, independent of the automated
// eligibility engine.
func (r *Repository) SetAdminOverride(userID, adminID string, status *string, reason string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_accounts SET
			admin_override_status = $2, admin_override_reason = $3,
			admin_override_by = $4::uuid, admin_override_at = NOW(), updated_at = NOW()
		WHERE user_id = $1::uuid`,
		userID, status, reason, adminID)
	return err
}

// ── Identity / account-age / fraud signals (reads from `users`) ────────────

func (r *Repository) UserProfile(userID string) (ageDays int, hasBasicIdentity bool, err error) {
	var createdAt time.Time
	var name, email, phone sql.NullString
	err = r.db.QueryRow(`SELECT created_at, name, email, phone FROM users WHERE id = $1::uuid`, userID).
		Scan(&createdAt, &name, &email, &phone)
	if err != nil {
		return 0, false, err
	}
	ageDays = int(time.Since(createdAt).Hours() / 24)
	hasBasicIdentity = name.Valid && name.String != "" && email.Valid && email.String != "" && phone.Valid && phone.String != ""
	return ageDays, hasBasicIdentity, nil
}

func (r *Repository) CountOpenRequests(userID string) (int, error) {
	var n int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM lifefund_requests
		WHERE user_id = $1::uuid AND status NOT IN ('REJECTED','COMPLETED','CANCELLED','DEFAULTED')`,
		userID).Scan(&n)
	return n, err
}

func (r *Repository) CountRequestsSince(userID string, since time.Time) (int, error) {
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM lifefund_requests WHERE user_id = $1::uuid AND created_at >= $2`,
		userID, since).Scan(&n)
	return n, err
}

func (r *Repository) HasDuplicateBillReference(userID, billRef string) (bool, error) {
	if strings.TrimSpace(billRef) == "" {
		return false, nil
	}
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM lifefund_requests WHERE user_id = $1::uuid AND bill_reference = $2`,
		userID, billRef).Scan(&n)
	return n > 0, err
}

// ── Requests ─────────────────────────────────────────────────────────────

const requestSelectCols = `
	r.id, r.user_id, u.name, u.email,
	r.expense_category, r.purpose_description,
	r.healthcare_provider_name, r.healthcare_provider_account, r.bill_reference, r.supporting_documents,
	r.requested_amount, r.approved_amount, r.financing_provider,
	r.interest_rate_pct, r.fee_amount, r.total_repayable, r.outstanding_balance,
	r.repayment_frequency_days, r.installments_count, r.first_repayment_date::text, r.final_repayment_date::text,
	r.risk_score, r.fraud_flags,
	r.status, r.admin_notes, r.reviewed_by, r.reviewed_at,
	r.agreement_terms, r.agreement_accepted_at, r.disbursed_at, r.completed_at,
	r.created_at, r.updated_at`

func scanRequest(row interface{ Scan(...interface{}) error }) (*Request, error) {
	var q Request
	var purpose, providerName, providerAcct, billRef sql.NullString
	var docsJSON, flagsJSON, agreementJSON []byte
	var approvedAmount, totalRepayable sql.NullFloat64
	var firstRepay, finalRepay sql.NullString
	var reviewedBy sql.NullString
	var reviewedAt, agreementAcceptedAt, disbursedAt, completedAt sql.NullTime

	if err := row.Scan(
		&q.ID, &q.UserID, &q.PatientName, &q.PatientEmail,
		&q.ExpenseCategory, &purpose,
		&providerName, &providerAcct, &billRef, &docsJSON,
		&q.RequestedAmount, &approvedAmount, &q.FinancingProvider,
		&q.InterestRatePct, &q.FeeAmount, &totalRepayable, &q.OutstandingBalance,
		&q.RepaymentFrequencyDays, &q.InstallmentsCount, &firstRepay, &finalRepay,
		&q.RiskScore, &flagsJSON,
		&q.Status, &q.AdminNotes, &reviewedBy, &reviewedAt,
		&agreementJSON, &agreementAcceptedAt, &disbursedAt, &completedAt,
		&q.CreatedAt, &q.UpdatedAt,
	); err != nil {
		return nil, err
	}

	q.PurposeDescription = purpose.String
	q.HealthcareProviderName = providerName.String
	q.HealthcareProviderAccount = providerAcct.String
	q.BillReference = billRef.String
	if len(docsJSON) > 0 {
		_ = json.Unmarshal(docsJSON, &q.SupportingDocuments)
	}
	if q.SupportingDocuments == nil {
		q.SupportingDocuments = []Document{}
	}
	if len(flagsJSON) > 0 {
		_ = json.Unmarshal(flagsJSON, &q.FraudFlags)
	}
	if q.FraudFlags == nil {
		q.FraudFlags = []FraudFlag{}
	}
	if approvedAmount.Valid {
		q.ApprovedAmount = &approvedAmount.Float64
	}
	if totalRepayable.Valid {
		q.TotalRepayable = &totalRepayable.Float64
	}
	if firstRepay.Valid {
		q.FirstRepaymentDate = &firstRepay.String
	}
	if finalRepay.Valid {
		q.FinalRepaymentDate = &finalRepay.String
	}
	if reviewedBy.Valid {
		q.ReviewedBy = &reviewedBy.String
	}
	if reviewedAt.Valid {
		q.ReviewedAt = &reviewedAt.Time
	}
	if len(agreementJSON) > 0 && string(agreementJSON) != "{}" {
		var terms AgreementTerms
		if err := json.Unmarshal(agreementJSON, &terms); err == nil {
			q.AgreementTerms = &terms
		}
	}
	if agreementAcceptedAt.Valid {
		q.AgreementAcceptedAt = &agreementAcceptedAt.Time
	}
	if disbursedAt.Valid {
		q.DisbursedAt = &disbursedAt.Time
	}
	if completedAt.Valid {
		q.CompletedAt = &completedAt.Time
	}
	return &q, nil
}

func (r *Repository) CreateRequest(userID string, in SubmitRequestInput, riskScore float64, flags []FraudFlag, cfg Config) (string, error) {
	docsJSON, _ := json.Marshal(in.SupportingDocuments)
	flagsJSON, _ := json.Marshal(flags)
	if flags == nil {
		flagsJSON = []byte(`[]`)
	}

	var id string
	err := r.db.QueryRow(`
		INSERT INTO lifefund_requests (
			user_id, expense_category, purpose_description,
			healthcare_provider_name, healthcare_provider_account, bill_reference,
			supporting_documents, requested_amount, interest_rate_pct, fee_amount,
			repayment_frequency_days, installments_count, risk_score, fraud_flags, status
		) VALUES (
			$1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		) RETURNING id`,
		userID, in.ExpenseCategory, in.PurposeDescription,
		in.HealthcareProviderName, in.HealthcareProviderAccount, in.BillReference,
		docsJSON, in.RequestedAmount, cfg.InterestRatePct, cfg.FlatFee,
		cfg.RepaymentFrequencyDays, cfg.DefaultInstallments, riskScore, flagsJSON, ReqPendingReview,
	).Scan(&id)
	return id, err
}

func (r *Repository) GetRequest(id string) (*Request, error) {
	row := r.db.QueryRow(`SELECT `+requestSelectCols+` FROM lifefund_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1::uuid`, id)
	req, err := scanRequest(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return req, err
}

func (r *Repository) ListRequestsByUser(userID string) ([]Request, error) {
	rows, err := r.db.Query(`SELECT `+requestSelectCols+` FROM lifefund_requests r JOIN users u ON u.id = r.user_id
		WHERE r.user_id = $1::uuid ORDER BY r.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		req, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *req)
	}
	if out == nil {
		out = []Request{}
	}
	return out, nil
}

// AdminListFilters narrows the admin request queue.
type AdminListFilters struct {
	Status   string // empty = all
	Search   string // matches patient name/email
	Page     int
	PageSize int
}

func (r *Repository) ListRequestsAdmin(f AdminListFilters) ([]Request, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 200 {
		f.PageSize = 50
	}
	where := []string{"1=1"}
	args := []interface{}{}
	argN := 1

	if f.Status != "" {
		where = append(where, fmt.Sprintf("r.status = $%d", argN))
		args = append(args, f.Status)
		argN++
	}
	if strings.TrimSpace(f.Search) != "" {
		where = append(where, fmt.Sprintf("(u.name ILIKE $%d OR u.email ILIKE $%d)", argN, argN))
		args = append(args, "%"+f.Search+"%")
		argN++
	}
	whereClause := strings.Join(where, " AND ")

	var total int
	countQuery := `SELECT COUNT(*) FROM lifefund_requests r JOIN users u ON u.id = r.user_id WHERE ` + whereClause
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	query := `SELECT ` + requestSelectCols + ` FROM lifefund_requests r JOIN users u ON u.id = r.user_id
		WHERE ` + whereClause + fmt.Sprintf(" ORDER BY r.created_at DESC LIMIT $%d OFFSET $%d", argN, argN+1)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		req, err := scanRequest(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *req)
	}
	if out == nil {
		out = []Request{}
	}
	return out, total, nil
}

// UpdateRequestFields applies a partial update; pass nil for fields you don't
// want to touch is not supported here for simplicity — callers build the
// full set of columns they need via the small helpers below instead, which
// keeps each admin action's SQL explicit and auditable.

func (r *Repository) SetRequestStatus(id, status, adminID, notes string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET status = $2, admin_notes = $3,
			reviewed_by = $4::uuid, reviewed_at = NOW(), updated_at = NOW()
		WHERE id = $1::uuid`, id, status, notes, adminID)
	return err
}

func (r *Repository) ApproveRequest(id, adminID, notes string, approvedAmount, totalRepayable float64, agreement AgreementTerms) error {
	agreementJSON, _ := json.Marshal(agreement)
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET
			status = $2, approved_amount = $3, total_repayable = $4, outstanding_balance = $4,
			agreement_terms = $5, admin_notes = $6, reviewed_by = $7::uuid, reviewed_at = NOW(),
			first_repayment_date = $8::date, final_repayment_date = $9::date, updated_at = NOW()
		WHERE id = $1::uuid`,
		id, ReqAwaitingAcceptance, approvedAmount, totalRepayable, agreementJSON, notes, adminID,
		agreement.FirstRepaymentDate, agreement.FinalRepaymentDate)
	return err
}

func (r *Repository) ReduceRequestAmount(id, adminID, notes string, reducedAmount float64) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET requested_amount = $2, admin_notes = $3,
			reviewed_by = $4::uuid, updated_at = NOW()
		WHERE id = $1::uuid`, id, reducedAmount, notes, adminID)
	return err
}

func (r *Repository) AcceptAgreement(id string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET status = $2, agreement_accepted_at = NOW(), updated_at = NOW()
		WHERE id = $1::uuid`, id, ReqAccepted)
	return err
}

func (r *Repository) MarkDisbursed(id, adminID, notes string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET status = $2, disbursed_at = NOW(), admin_notes = $3,
			reviewed_by = $4::uuid, updated_at = NOW()
		WHERE id = $1::uuid`, id, ReqDisbursed, notes, adminID)
	return err
}

func (r *Repository) SetRequestActive(id string) error {
	_, err := r.db.Exec(`UPDATE lifefund_requests SET status = $2, updated_at = NOW() WHERE id = $1::uuid`, id, ReqActive)
	return err
}

func (r *Repository) CompleteRequest(id string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET status = $2, completed_at = NOW(), outstanding_balance = 0, updated_at = NOW()
		WHERE id = $1::uuid`, id, ReqCompleted)
	return err
}

func (r *Repository) DefaultRequest(id string) error {
	_, err := r.db.Exec(`
		UPDATE lifefund_requests SET status = $2, defaulted_at = NOW(), updated_at = NOW()
		WHERE id = $1::uuid`, id, ReqDefaulted)
	return err
}

func (r *Repository) UpdateRequestOutstanding(id string, outstanding float64) error {
	_, err := r.db.Exec(`UPDATE lifefund_requests SET outstanding_balance = $2, updated_at = NOW() WHERE id = $1::uuid`, id, outstanding)
	return err
}

// ── Repayment schedule ───────────────────────────────────────────────────

func (r *Repository) InsertSchedule(requestID string, installments []RepaymentInstallment) error {
	for _, inst := range installments {
		_, err := r.db.Exec(`
			INSERT INTO lifefund_repayment_schedule (request_id, installment_no, due_date, amount_due)
			VALUES ($1::uuid, $2, $3::date, $4)`,
			requestID, inst.InstallmentNo, inst.DueDate, inst.AmountDue)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) GetSchedule(requestID string) ([]RepaymentInstallment, error) {
	rows, err := r.db.Query(`
		SELECT id, request_id, installment_no, due_date, amount_due, amount_paid, status, paid_at
		FROM lifefund_repayment_schedule WHERE request_id = $1::uuid ORDER BY installment_no`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RepaymentInstallment
	for rows.Next() {
		var i RepaymentInstallment
		var due time.Time
		var paidAt sql.NullTime
		if err := rows.Scan(&i.ID, &i.RequestID, &i.InstallmentNo, &due, &i.AmountDue, &i.AmountPaid, &i.Status, &paidAt); err != nil {
			return nil, err
		}
		i.DueDate = due.Format("2006-01-02")
		if paidAt.Valid {
			i.PaidAt = &paidAt.Time
		}
		out = append(out, i)
	}
	if out == nil {
		out = []RepaymentInstallment{}
	}
	return out, nil
}

// NextUnpaidInstallment returns the earliest PENDING/PARTIAL/OVERDUE installment.
func (r *Repository) NextUnpaidInstallment(requestID string) (*RepaymentInstallment, error) {
	row := r.db.QueryRow(`
		SELECT id, request_id, installment_no, due_date, amount_due, amount_paid, status, paid_at
		FROM lifefund_repayment_schedule
		WHERE request_id = $1::uuid AND status IN ('PENDING','PARTIAL','OVERDUE')
		ORDER BY installment_no LIMIT 1`, requestID)
	var i RepaymentInstallment
	var due time.Time
	var paidAt sql.NullTime
	err := row.Scan(&i.ID, &i.RequestID, &i.InstallmentNo, &due, &i.AmountDue, &i.AmountPaid, &i.Status, &paidAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	i.DueDate = due.Format("2006-01-02")
	if paidAt.Valid {
		i.PaidAt = &paidAt.Time
	}
	return &i, nil
}

func (r *Repository) ApplyPaymentToInstallment(scheduleID string, amount float64) (fullyPaid bool, err error) {
	row := r.db.QueryRow(`
		UPDATE lifefund_repayment_schedule
		SET amount_paid = amount_paid + $2,
			status = CASE WHEN amount_paid + $2 >= amount_due THEN 'PAID' ELSE 'PARTIAL' END,
			paid_at = CASE WHEN amount_paid + $2 >= amount_due THEN NOW() ELSE paid_at END
		WHERE id = $1::uuid
		RETURNING status = 'PAID'`, scheduleID, amount)
	err = row.Scan(&fullyPaid)
	return fullyPaid, err
}

// ── Repayment ledger ─────────────────────────────────────────────────────

func (r *Repository) InsertRepayment(requestID, userID string, scheduleID *string, amount float64, method, providerRef string) (string, error) {
	var id string
	err := r.db.QueryRow(`
		INSERT INTO lifefund_repayments (request_id, schedule_id, user_id, amount, method, provider_ref)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6) RETURNING id`,
		requestID, scheduleID, userID, amount, method, providerRef).Scan(&id)
	return id, err
}

func (r *Repository) GetRepayments(requestID string) ([]Repayment, error) {
	rows, err := r.db.Query(`
		SELECT id, request_id, schedule_id, amount, method, provider_ref, status, paid_at
		FROM lifefund_repayments WHERE request_id = $1::uuid ORDER BY paid_at DESC`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Repayment
	for rows.Next() {
		var p Repayment
		var sched sql.NullString
		if err := rows.Scan(&p.ID, &p.RequestID, &sched, &p.Amount, &p.Method, &p.ProviderRef, &p.Status, &p.PaidAt); err != nil {
			return nil, err
		}
		if sched.Valid {
			p.ScheduleID = &sched.String
		}
		out = append(out, p)
	}
	if out == nil {
		out = []Repayment{}
	}
	return out, nil
}

// ── Admin dashboard ──────────────────────────────────────────────────────

func (r *Repository) DashboardSummary() (*DashboardSummary, error) {
	var s DashboardSummary
	err := r.db.QueryRow(`
		SELECT
			COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW' AND created_at >= NOW() - INTERVAL '24 hours'),
			COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW'),
			COUNT(*) FILTER (WHERE status IN ('APPROVED','AWAITING_ACCEPTANCE','ACCEPTED')),
			COUNT(*) FILTER (WHERE status = 'REJECTED'),
			COUNT(*) FILTER (WHERE status = 'DISBURSED'),
			COUNT(*) FILTER (WHERE status = 'ACTIVE'),
			COUNT(*) FILTER (WHERE status = 'COMPLETED'),
			COUNT(*) FILTER (WHERE status = 'OVERDUE'),
			COUNT(*) FILTER (WHERE status = 'DEFAULTED'),
			COUNT(*) FILTER (WHERE jsonb_array_length(fraud_flags) > 0),
			COALESCE(SUM(outstanding_balance) FILTER (WHERE status IN ('ACTIVE','OVERDUE','DISBURSED')), 0),
			COALESCE(SUM(approved_amount) FILTER (WHERE status IN ('DISBURSED','ACTIVE','OVERDUE','COMPLETED','DEFAULTED')), 0)
		FROM lifefund_requests`,
	).Scan(&s.NewRequests, &s.PendingReview, &s.Approved, &s.Rejected, &s.Disbursed,
		&s.Active, &s.FullyRepaid, &s.Overdue, &s.Defaulted, &s.FraudFlagged,
		&s.TotalOutstanding, &s.TotalDisbursedAmount)
	return &s, err
}

// MarkOverdueInstallments flips PENDING installments past their due date to
// OVERDUE, and cascades the parent request to OVERDUE. Returns the request
// IDs that just became overdue (for repayment-reminder notifications) and
// the request IDs whose overdue installment count crossed into default.
func (r *Repository) MarkOverdueInstallments() (newlyOverdueRequestIDs []string, err error) {
	rows, err := r.db.Query(`
		UPDATE lifefund_repayment_schedule
		SET status = 'OVERDUE'
		WHERE status = 'PENDING' AND due_date < CURRENT_DATE
		RETURNING request_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if !seen[id] {
			seen[id] = true
			newlyOverdueRequestIDs = append(newlyOverdueRequestIDs, id)
		}
	}
	for _, id := range newlyOverdueRequestIDs {
		_, _ = r.db.Exec(`UPDATE lifefund_requests SET status = 'OVERDUE', updated_at = NOW()
			WHERE id = $1::uuid AND status IN ('ACTIVE','DISBURSED')`, id)
	}
	return newlyOverdueRequestIDs, nil
}

// ── Audit trail (shared audit_events table) ─────────────────────────────

func (r *Repository) GetAuditTrail(requestID string) ([]AuditEntry, error) {
	rows, err := r.db.Query(`
		SELECT id, actor_id, actor_role, event_type, old_value, new_value, metadata, created_at
		FROM audit_events WHERE resource = 'lifefund_request' AND resource_id = $1::uuid
		ORDER BY created_at DESC`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditEntry
	for rows.Next() {
		var e AuditEntry
		var actorID sql.NullString
		var oldRaw, newRaw, metaRaw []byte
		if err := rows.Scan(&e.ID, &actorID, &e.ActorRole, &e.EventType, &oldRaw, &newRaw, &metaRaw, &e.CreatedAt); err != nil {
			return nil, err
		}
		if actorID.Valid {
			e.ActorID = &actorID.String
		}
		if len(oldRaw) > 0 {
			_ = json.Unmarshal(oldRaw, &e.OldValue)
		}
		if len(newRaw) > 0 {
			_ = json.Unmarshal(newRaw, &e.NewValue)
		}
		if len(metaRaw) > 0 {
			_ = json.Unmarshal(metaRaw, &e.Metadata)
		}
		out = append(out, e)
	}
	if out == nil {
		out = []AuditEntry{}
	}
	return out, nil
}
