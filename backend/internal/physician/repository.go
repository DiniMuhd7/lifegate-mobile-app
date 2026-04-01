package physician

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"time"
)

// ErrCaseNotPending is returned when a TakeCase call targets a case that is no
// longer Pending (i.e. another physician has already claimed it).
var ErrCaseNotPending = errors.New("case is no longer Pending")

// ErrCaseNotActive is returned when ReviewReport's Completed transition targets
// a case not owned by this physician in Active state.
var ErrCaseNotActive = errors.New("case is not Active for this physician")

type Report struct {
ID             string         `json:"id"`
UserID         string         `json:"user_id"`
PhysicianID    sql.NullString `json:"-"`
Title          sql.NullString `json:"-"`
Description    sql.NullString `json:"-"`
Condition      sql.NullString `json:"-"`
Urgency        sql.NullString `json:"-"`
PhysicianNotes sql.NullString `json:"-"`
Status         string         `json:"status"`
PatientName    sql.NullString `json:"-"`
CreatedAt      time.Time      `json:"created_at"`
UpdatedAt      time.Time      `json:"updated_at"`
// Exported flattened fields for JSON response
TitleStr          string `json:"title,omitempty"`
DescriptionStr    string `json:"description,omitempty"`
ConditionStr      string `json:"condition,omitempty"`
UrgencyStr        string `json:"urgency,omitempty"`
PhysicianNotesStr string `json:"physician_notes,omitempty"`
PatientNameStr    string `json:"patient_name,omitempty"`
}

type Stats struct {
TotalReports    int `json:"totalReports"`
PendingCount    int `json:"pendingCount"`
ActiveCount     int `json:"activeCount"`
CompletedCount  int `json:"completedCount"`
}

type Repository struct {
db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
return &Repository{db: db}
}

func (r *Repository) GetReports(physicianID string, page, pageSize int) ([]Report, int, error) {
offset := (page - 1) * pageSize
rows, err := r.db.Query(
`SELECT d.id, d.user_id, d.physician_id, d.title, d.description, d.condition, d.urgency,
        d.physician_notes, d.status, u.name, d.created_at, d.updated_at
 FROM diagnoses d
 LEFT JOIN users u ON u.id = d.user_id
 WHERE d.physician_id = $1 OR d.physician_id IS NULL
 ORDER BY d.created_at DESC
 LIMIT $2 OFFSET $3`, physicianID, pageSize, offset)
if err != nil {
return nil, 0, err
}
defer rows.Close()

var reports []Report
for rows.Next() {
var rpt Report
if err := rows.Scan(
&rpt.ID, &rpt.UserID, &rpt.PhysicianID, &rpt.Title, &rpt.Description,
&rpt.Condition, &rpt.Urgency, &rpt.PhysicianNotes, &rpt.Status,
&rpt.PatientName, &rpt.CreatedAt, &rpt.UpdatedAt,
); err != nil {
log.Printf("physician: scan report row: %v", err)
continue
}
rpt.TitleStr = rpt.Title.String
rpt.DescriptionStr = rpt.Description.String
rpt.ConditionStr = rpt.Condition.String
rpt.UrgencyStr = rpt.Urgency.String
rpt.PhysicianNotesStr = rpt.PhysicianNotes.String
rpt.PatientNameStr = rpt.PatientName.String
reports = append(reports, rpt)
}

var total int
_ = r.db.QueryRow(`SELECT COUNT(*) FROM diagnoses WHERE physician_id=$1 OR physician_id IS NULL`, physicianID).Scan(&total)

return reports, total, rows.Err()
}

func (r *Repository) GetStats(physicianID string) (*Stats, error) {
stats := &Stats{}
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE physician_id=$1 OR physician_id IS NULL`, physicianID).Scan(&stats.TotalReports)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Pending'`, physicianID).Scan(&stats.PendingCount)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Active'`, physicianID).Scan(&stats.ActiveCount)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Completed'`, physicianID).Scan(&stats.CompletedCount)
return stats, nil
}

// CaseQueueItem is the richer representation used by the case-queue endpoint.
type CaseQueueItem struct {
	ID             string    `json:"id"`
	PatientName    string    `json:"patientName"`
	PatientID      string    `json:"patientId"`
	Title          string    `json:"title"`
	SymptomSnippet string    `json:"symptomSnippet"`
	Urgency        string    `json:"urgency"`
	Status         string    `json:"status"`
	PhysicianID    string    `json:"physicianId,omitempty"`
	Escalated      bool      `json:"escalated"`
	TimeInQueue    string    `json:"timeInQueue"`
	QueuePosition  int       `json:"queuePosition,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// ─── Case-detail types ────────────────────────────────────────────────────────

// AIConditionDetail mirrors the ai_response.diagnosis JSONB sub-object.
type AIConditionDetail struct {
	Condition   string `json:"condition"`
	Urgency     string `json:"urgency"`
	Description string `json:"description"`
	Confidence  int    `json:"confidence"`
}

// PrescriptionOutput mirrors ai_response.prescription.
type PrescriptionOutput struct {
	Medicine     string `json:"medicine"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Instructions string `json:"instructions,omitempty"`
}

// AIOutput mirrors the full ai_response JSONB column.
type AIOutput struct {
	Text         string              `json:"text"`
	Diagnosis    *AIConditionDetail  `json:"diagnosis,omitempty"`
	Prescription *PrescriptionOutput `json:"prescription,omitempty"`
}

// CaseDetail is the rich case record returned for physician review.
type CaseDetail struct {
	ID                string     `json:"id"`
	PatientID         string     `json:"patientId"`
	PatientName       string     `json:"patientName"`
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	Condition         string     `json:"condition"`
	Urgency           string     `json:"urgency"`
	Status            string     `json:"status"`
	PhysicianID       string     `json:"physicianId,omitempty"`
	PhysicianNotes    string     `json:"physicianNotes,omitempty"`
	PhysicianDecision string     `json:"physicianDecision,omitempty"`
	RejectionReason   string     `json:"rejectionReason,omitempty"`
	Escalated         bool       `json:"escalated"`
	AIResponse        *AIOutput  `json:"aiResponse,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// PatientProfile is the subset of user data included in the case-detail view.
type PatientProfile struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Email              string    `json:"email"`
	Phone              string    `json:"phone,omitempty"`
	DOB                string    `json:"dob,omitempty"`
	Gender             string    `json:"gender,omitempty"`
	BloodType          string    `json:"bloodType,omitempty"`
	Allergies          string    `json:"allergies,omitempty"`
	MedicalHistory     string    `json:"medicalHistory,omitempty"`
	CurrentMedications string    `json:"currentMedications,omitempty"`
	EmergencyContact   string    `json:"emergencyContact,omitempty"`
	HealthHistory      string    `json:"healthHistory,omitempty"`
	CreatedAt          time.Time `json:"createdAt"`
}

// ReviewInput carries the physician's decision when reviewing a case.
type ReviewInput struct {
	Action            string // "Active" | "Completed"
	Notes             string
	PhysicianDecision string // "Approved" | "Rejected"  (required when Action="Completed")
	RejectionReason   string // required when PhysicianDecision="Rejected"
}

// ReviewReport enforces the state machine and returns the patient's user_id for
// real-time WebSocket notification.
//
// Allowed transitions:
//   - Pending → Active   (physician takes case)
//   - Active  → Completed (physician submits review)
func (r *Repository) ReviewReport(reportID, physicianID string, input ReviewInput) (patientID string, err error) {
	switch input.Action {
	case "Active", "Completed":
		// valid target states
	default:
		return "", fmt.Errorf("invalid action %q: must be Active or Completed", input.Action)
	}

	var q string
	if input.Action == "Completed" {
		// Gate: case must be Active AND owned by this physician.
		q = `UPDATE diagnoses
		     SET physician_id=$1, physician_notes=$2, status=$3,
		         physician_decision=$5, rejection_reason=$6, updated_at=NOW()
		     WHERE id=$4 AND physician_id=$1 AND status='Active'
		     RETURNING user_id::text`
	} else {
		// Gate: case must be Pending AND unowned (or already owned by this physician).
		q = `UPDATE diagnoses
		     SET physician_id=$1, physician_notes=$2, status=$3,
		         physician_decision=$5, rejection_reason=$6, updated_at=NOW()
		     WHERE id=$4 AND (physician_id IS NULL OR physician_id=$1) AND status='Pending'
		     RETURNING user_id::text`
	}

	err = r.db.QueryRow(q, physicianID, input.Notes, input.Action, reportID,
		input.PhysicianDecision, input.RejectionReason).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		if input.Action == "Completed" {
			return "", ErrCaseNotActive
		}
		return "", ErrCaseNotPending
	}
	return patientID, err
}

// TakeCase atomically claims an unowned Pending case, transitioning it to Active
// and locking it to physicianID.  Returns ErrCaseNotPending if the case is no
// longer available (race condition — another physician took it first).
func (r *Repository) TakeCase(caseID, physicianID string) (patientID string, err error) {
	err = r.db.QueryRow(
		`UPDATE diagnoses
		 SET physician_id = $1, status = 'Active', updated_at = NOW()
		 WHERE id = $2 AND status = 'Pending' AND physician_id IS NULL
		 RETURNING user_id::text`,
		physicianID, caseID,
	).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrCaseNotPending
	}
	return patientID, err
}

// GetCaseQueue returns cases visible to a physician, grouped by status.
//
//   - Pending:   any unassigned case (physician_id IS NULL), FIFO order.
//   - Active:    cases locked to this physician.
//   - Completed: cases completed by this physician (newest first, capped at 50).
func (r *Repository) GetCaseQueue(physicianID string) (pending, active, completed []CaseQueueItem, err error) {
	const base = `
		SELECT d.id, COALESCE(u.name,''), d.user_id::text,
		       COALESCE(d.title,''), COALESCE(d.description,''),
		       COALESCE(d.urgency,''), d.status,
		       COALESCE(d.physician_id::text,''), d.escalated,
		       d.created_at, d.updated_at
		FROM diagnoses d
		LEFT JOIN users u ON u.id = d.user_id`

	pendingRows, perr := r.db.Query(base + `
		WHERE d.status = 'Pending' AND d.physician_id IS NULL
		ORDER BY d.created_at ASC LIMIT 100`)
	if perr != nil {
		return nil, nil, nil, perr
	}
	defer pendingRows.Close()
	pos := 1
	for pendingRows.Next() {
		item, scanErr := scanCaseQueueItem(pendingRows)
		if scanErr != nil {
			log.Printf("physician: scan pending: %v", scanErr)
			continue
		}
		item.QueuePosition = pos
		pos++
		pending = append(pending, item)
	}
	if e := pendingRows.Err(); e != nil {
		return nil, nil, nil, e
	}

	activeRows, aerr := r.db.Query(base+`
		WHERE d.status = 'Active' AND d.physician_id = $1::uuid
		ORDER BY d.updated_at DESC`, physicianID)
	if aerr != nil {
		return nil, nil, nil, aerr
	}
	defer activeRows.Close()
	for activeRows.Next() {
		item, scanErr := scanCaseQueueItem(activeRows)
		if scanErr != nil {
			log.Printf("physician: scan active: %v", scanErr)
			continue
		}
		active = append(active, item)
	}
	if e := activeRows.Err(); e != nil {
		return nil, nil, nil, e
	}

	completedRows, cerr := r.db.Query(base+`
		WHERE d.status = 'Completed' AND d.physician_id = $1::uuid
		ORDER BY d.updated_at DESC LIMIT 50`, physicianID)
	if cerr != nil {
		return nil, nil, nil, cerr
	}
	defer completedRows.Close()
	for completedRows.Next() {
		item, scanErr := scanCaseQueueItem(completedRows)
		if scanErr != nil {
			log.Printf("physician: scan completed: %v", scanErr)
			continue
		}
		completed = append(completed, item)
	}
	if e := completedRows.Err(); e != nil {
		return nil, nil, nil, e
	}

	return pending, active, completed, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func scanCaseQueueItem(rows *sql.Rows) (CaseQueueItem, error) {
	var item CaseQueueItem
	var createdAt, updatedAt time.Time
	err := rows.Scan(
		&item.ID, &item.PatientName, &item.PatientID,
		&item.Title, &item.SymptomSnippet,
		&item.Urgency, &item.Status,
		&item.PhysicianID, &item.Escalated,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return item, err
	}
	item.CreatedAt = createdAt
	item.UpdatedAt = updatedAt
	item.SymptomSnippet = truncateRunes(item.SymptomSnippet, 120)
	item.TimeInQueue = formatQueueDuration(time.Since(createdAt))
	return item, nil
}

func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

func formatQueueDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	hours := int(math.Floor(d.Hours()))
	minutes := int(math.Floor(d.Minutes())) % 60
	days := hours / 24
	switch {
	case days >= 1:
		return fmt.Sprintf("%dd %dh", days, hours%24)
	case hours >= 1:
		return fmt.Sprintf("%dh %dm", hours, minutes)
	default:
		return fmt.Sprintf("%dm", minutes)
	}
}

// ─── Case-detail queries ──────────────────────────────────────────────────────

// GetCaseDetail returns the full case record for physician review.  A physician
// may access:
//   - Any case assigned to them (any status).
//   - Any unassigned Pending case (before taking it).
func (r *Repository) GetCaseDetail(caseID, physicianID string) (*CaseDetail, error) {
	var d CaseDetail
	var aiJSON string
	err := r.db.QueryRow(`
		SELECT d.id, d.user_id::text, COALESCE(u.name,''),
		       COALESCE(d.title,''), COALESCE(d.description,''),
		       COALESCE(d.condition,''), COALESCE(d.urgency,''),
		       d.status, COALESCE(d.physician_id::text,''),
		       COALESCE(d.physician_notes,''),
		       COALESCE(d.physician_decision,''),
		       COALESCE(d.rejection_reason,''),
		       d.escalated,
		       COALESCE(d.ai_response::text,'{}'),
		       d.created_at, d.updated_at
		FROM diagnoses d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE d.id = $1
		  AND (
		        d.physician_id = $2::uuid
		     OR (d.physician_id IS NULL AND d.status = 'Pending')
		  )`,
		caseID, physicianID,
	).Scan(
		&d.ID, &d.PatientID, &d.PatientName,
		&d.Title, &d.Description,
		&d.Condition, &d.Urgency,
		&d.Status, &d.PhysicianID,
		&d.PhysicianNotes,
		&d.PhysicianDecision,
		&d.RejectionReason,
		&d.Escalated,
		&aiJSON,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// Parse the ai_response JSONB into a typed structure.
	var aiOut AIOutput
	if jerr := json.Unmarshal([]byte(aiJSON), &aiOut); jerr == nil &&
		(aiOut.Text != "" || aiOut.Diagnosis != nil) {
		d.AIResponse = &aiOut
	}
	return &d, nil
}

// GetPatientProfile returns the patient user record (role='user') by their ID.
// Returns nil when the patient does not exist or the ID belongs to a physician.
func (r *Repository) GetPatientProfile(patientID string) (*PatientProfile, error) {
	var p PatientProfile
	err := r.db.QueryRow(`
		SELECT id::text, COALESCE(name,''), COALESCE(email,''),
		       COALESCE(phone,''), COALESCE(dob,''), COALESCE(gender,''),
		       COALESCE(blood_type,''), COALESCE(allergies,''),
		       COALESCE(medical_history,''), COALESCE(current_medications,''),
		       COALESCE(emergency_contact,''), COALESCE(health_history,''),
		       created_at
		FROM users
		WHERE id = $1::uuid AND role = 'user'`,
		patientID,
	).Scan(
		&p.ID, &p.Name, &p.Email,
		&p.Phone, &p.DOB, &p.Gender,
		&p.BloodType, &p.Allergies,
		&p.MedicalHistory, &p.CurrentMedications,
		&p.EmergencyContact, &p.HealthHistory,
		&p.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &p, err
}

// ── Earnings ──────────────────────────────────────────────────────────────────

// EarningRate is the fixed per-case payout amount in Nigerian Naira.
const EarningRate = 500

// EarningsSummary is the aggregate view returned by the earnings dashboard.
type EarningsSummary struct {
	TotalEarned      int    `json:"totalEarned"`
	PendingPayout    int    `json:"pendingPayout"`
	PaidOut          int    `json:"paidOut"`
	CasesCompleted   int    `json:"casesCompleted"`
	CasesPending     int    `json:"casesPending"`
	PerCaseRate      int    `json:"perCaseRate"`
	NextPayoutDate   string `json:"nextPayoutDate"`
	LastPayoutAmount int    `json:"lastPayoutAmount"`
}

// EarningRecord is a single approved-case earnings row joined with diagnosis data.
type EarningRecord struct {
	ID          string `json:"id"`
	DiagnosisID string `json:"diagnosisId"`
	PatientName string `json:"patientName"`
	Condition   string `json:"condition"`
	Urgency     string `json:"urgency"`
	Decision    string `json:"decision"`
	Amount      int    `json:"amount"`
	Status      string `json:"status"`
	CasedAt     string `json:"casedAt"`
	CreatedAt   string `json:"createdAt"`
}

// Payout is a single weekly payout record.
type Payout struct {
	ID          string `json:"id"`
	PeriodStart string `json:"periodStart"`
	PeriodEnd   string `json:"periodEnd"`
	CaseCount   int    `json:"caseCount"`
	TotalAmount int    `json:"totalAmount"`
	Status      string `json:"status"`
	PaidAt      string `json:"paidAt,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

// nextMonday returns the date of the next Monday at 00:00 UTC.
func nextMonday() time.Time {
	now := time.Now().UTC()
	daysUntilMonday := (8 - int(now.Weekday())) % 7
	if daysUntilMonday == 0 {
		daysUntilMonday = 7
	}
	next := now.AddDate(0, 0, daysUntilMonday)
	return time.Date(next.Year(), next.Month(), next.Day(), 0, 0, 0, 0, time.UTC)
}

// CreditEarning inserts a physician_earnings row when a case is approved.
// It is idempotent: the UNIQUE constraint on diagnosis_id means duplicate calls
// (e.g. retries) are silently ignored via ON CONFLICT DO NOTHING.
func (r *Repository) CreditEarning(physicianID, diagnosisID string) error {
	_, err := r.db.Exec(`
		INSERT INTO physician_earnings
		    (physician_id, diagnosis_id, patient_name, condition, urgency, amount_naira, status)
		SELECT
		    $1::uuid,
		    d.id,
		    COALESCE(u.name, ''),
		    COALESCE(d.condition, ''),
		    COALESCE(d.urgency, 'LOW'),
		    $3,
		    'pending'
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.id = $2::uuid
		ON CONFLICT (diagnosis_id) DO NOTHING`,
		physicianID, diagnosisID, EarningRate,
	)
	return err
}

// GetEarningsSummary returns the aggregated earnings dashboard data.
func (r *Repository) GetEarningsSummary(physicianID string) (*EarningsSummary, error) {
	var s EarningsSummary

	err := r.db.QueryRow(`
		SELECT
		    COALESCE(SUM(amount_naira), 0),
		    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_naira ELSE 0 END), 0),
		    COALESCE(SUM(CASE WHEN status = 'paid'    THEN amount_naira ELSE 0 END), 0),
		    COUNT(*),
		    COUNT(CASE WHEN status = 'pending' THEN 1 END)
		FROM physician_earnings
		WHERE physician_id = $1::uuid`,
		physicianID,
	).Scan(&s.TotalEarned, &s.PendingPayout, &s.PaidOut, &s.CasesCompleted, &s.CasesPending)
	if err != nil {
		return nil, err
	}

	// Most recent payout amount (best-effort; 0 if none exist yet).
	_ = r.db.QueryRow(`
		SELECT COALESCE(total_amount_naira, 0)
		FROM physician_payouts
		WHERE physician_id = $1::uuid
		ORDER BY period_start DESC
		LIMIT 1`,
		physicianID,
	).Scan(&s.LastPayoutAmount)

	s.PerCaseRate = EarningRate
	s.NextPayoutDate = nextMonday().Format("2006-01-02")
	return &s, nil
}

// GetEarningsHistory returns paginated per-case earning records, newest first.
func (r *Repository) GetEarningsHistory(physicianID string, page, pageSize int) ([]EarningRecord, int, error) {
	offset := (page - 1) * pageSize

	var total int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM physician_earnings WHERE physician_id = $1::uuid`,
		physicianID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(`
		SELECT
		    e.id,
		    e.diagnosis_id,
		    e.patient_name,
		    e.condition,
		    e.urgency,
		    COALESCE(d.physician_decision, 'Approved'),
		    e.amount_naira,
		    e.status,
		    d.updated_at,
		    e.created_at
		FROM physician_earnings e
		JOIN diagnoses d ON d.id = e.diagnosis_id
		WHERE e.physician_id = $1::uuid
		ORDER BY e.created_at DESC
		LIMIT $2 OFFSET $3`,
		physicianID, pageSize, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []EarningRecord
	for rows.Next() {
		var rec EarningRecord
		var casedAt, createdAt time.Time
		if err := rows.Scan(
			&rec.ID, &rec.DiagnosisID, &rec.PatientName, &rec.Condition, &rec.Urgency,
			&rec.Decision, &rec.Amount, &rec.Status, &casedAt, &createdAt,
		); err != nil {
			return nil, 0, err
		}
		rec.CasedAt = casedAt.Format(time.RFC3339)
		rec.CreatedAt = createdAt.Format(time.RFC3339)
		records = append(records, rec)
	}
	if records == nil {
		records = []EarningRecord{}
	}
	return records, total, rows.Err()
}

// GetPayouts returns all payout records for the physician, newest first.
func (r *Repository) GetPayouts(physicianID string) ([]Payout, error) {
	rows, err := r.db.Query(`
		SELECT id, period_start, period_end, case_count, total_amount_naira,
		       status, paid_at, created_at
		FROM physician_payouts
		WHERE physician_id = $1::uuid
		ORDER BY period_start DESC`,
		physicianID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payouts []Payout
	for rows.Next() {
		var p Payout
		var paidAt sql.NullTime
		var periodStart, periodEnd, createdAt time.Time
		if err := rows.Scan(
			&p.ID, &periodStart, &periodEnd, &p.CaseCount, &p.TotalAmount,
			&p.Status, &paidAt, &createdAt,
		); err != nil {
			return nil, err
		}
		p.PeriodStart = periodStart.Format("2006-01-02")
		p.PeriodEnd = periodEnd.Format("2006-01-02")
		p.CreatedAt = createdAt.Format(time.RFC3339)
		if paidAt.Valid {
			p.PaidAt = paidAt.Time.Format(time.RFC3339)
		}
		payouts = append(payouts, p)
	}
	if payouts == nil {
		payouts = []Payout{}
	}
	return payouts, rows.Err()
}

// ── AI Output ─────────────────────────────────────────────────────────────────

// UpdateAIOutput lets a physician correct the AI-generated diagnostic fields
// inline.  Both the top-level columns and the ai_response JSONB are kept in
// sync.  The case must be in Active status and owned by physicianID.
func (r *Repository) UpdateAIOutput(caseID, physicianID, condition, urgency string, confidence int) error {
	result, err := r.db.Exec(`
		UPDATE diagnoses
		SET condition  = $3,
		    urgency    = $4,
		    ai_response = jsonb_set(
		      jsonb_set(
		        jsonb_set(
		          COALESCE(ai_response, '{}'),
		          '{diagnosis,condition}', to_jsonb($3::text), true
		        ),
		        '{diagnosis,urgency}', to_jsonb($4::text), true
		      ),
		      '{diagnosis,confidence}', to_jsonb($5::int), true
		    ),
		    updated_at = NOW()
		WHERE id = $1 AND physician_id = $2::uuid AND status = 'Active'`,
		caseID, physicianID, condition, urgency, confidence,
	)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return ErrCaseNotActive
	}
	return nil
}

