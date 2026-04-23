package admin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// ─── Domain types ─────────────────────────────────────────────────────────────

// CaseRow is a single case record for admin case management.
type CaseRow struct {
	ID             string  `json:"id"`
	PatientName    string  `json:"patientName"`
	PatientEmail   string  `json:"patientEmail"`
	Title          string  `json:"title"`
	Condition      string  `json:"condition"`
	Urgency        string  `json:"urgency"`
	Status         string  `json:"status"`
	Category       string  `json:"category"`
	Escalated      bool    `json:"escalated"`
	Confidence     int     `json:"confidence"`
	PhysicianName  string  `json:"physicianName,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// SLAItem is a Pending case with its time-in-queue and colour-coded SLA state.
type SLAItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Urgency     string `json:"urgency"`
	SecondsWait int64  `json:"secondsWait"`
	SLAColor    string `json:"slaColor"` // "green" | "yellow" | "red"
	CreatedAt   string `json:"createdAt"`
}

// DashboardStats is the live dashboard data.
type DashboardStats struct {
	TotalCases           int            `json:"totalCases"`
	CasesByStatus        map[string]int `json:"casesByStatus"`
	TotalPhysicians      int            `json:"totalPhysicians"`
	AvailablePhysicians  int            `json:"availablePhysicians"`
	ActiveUsers7d        int            `json:"activeUsers7d"`
	TotalPatients        int            `json:"totalPatients"`
	EscalatedToday       int            `json:"escalatedToday"`
	CompletedToday       int            `json:"completedToday"`
}

// EDISMetrics is the EDIS performance panel data.
type EDISMetrics struct {
	TotalDiagnoses       int                  `json:"totalDiagnoses"`
	EscalationCount      int                  `json:"escalationCount"`
	EscalationRatePct    float64              `json:"escalationRatePct"`
	AvgConfidence        float64              `json:"avgConfidence"`
	LowConfidenceCount   int                  `json:"lowConfidenceCount"`
	LowConfidencePct     float64              `json:"lowConfidencePct"`
	FlagFrequency        []FlagCount          `json:"flagFrequency"`
	AvgConditionsPerCase float64              `json:"avgConditionsPerCase"`
	PeriodDays           int                  `json:"periodDays"`
}

// FlagCount is a single EDIS risk flag with its occurrence count.
type FlagCount struct {
	Flag  string `json:"flag"`
	Count int    `json:"count"`
}

// PhysicianRow is a physician summary for admin view.
type PhysicianRow struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Email              string  `json:"email"`
	Specialization     string  `json:"specialization"`
	MdcnVerified       bool    `json:"mdcnVerified"`
	MdcnOverrideStatus string  `json:"mdcnOverrideStatus"` // "" | "confirmed" | "rejected"
	AccountStatus      string  `json:"accountStatus"`       // "active" | "suspended"
	Flagged            bool    `json:"flagged"`
	FlaggedReason      string  `json:"flaggedReason,omitempty"`
	SlaBreachCountWeek int     `json:"slaBreachCountWeek"`
	ActiveCases        int     `json:"activeCases"`
	TotalCompleted     int     `json:"totalCompleted"`
	Available          bool    `json:"available"` // true when ActiveCases == 0
}

// PhysicianCaseHistory is a brief case record in a physician profile.
type PhysicianCaseHistory struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Condition  string `json:"condition"`
	Urgency    string `json:"urgency"`
	Status     string `json:"status"`
	Escalated  bool   `json:"escalated"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

// PhysicianDetail is the full physician profile for the admin detail view.
type PhysicianDetail struct {
	PhysicianRow
	Phone                string                 `json:"phone"`
	DOB                  string                 `json:"dob"`
	Gender               string                 `json:"gender"`
	YearsOfExperience    string                 `json:"yearsOfExperience"`
	CertificateName      string                 `json:"certificateName"`
	CertificateID        string                 `json:"certificateId"`
	CertificateIssueDate string                 `json:"certificateIssueDate"`
	CertificateURL       string                 `json:"certificateUrl"`
	FlaggedAt            string                 `json:"flaggedAt,omitempty"`
	MdcnOverrideBy       string                 `json:"mdcnOverrideBy,omitempty"` // admin name
	MdcnOverrideAt       string                 `json:"mdcnOverrideAt,omitempty"`
	CreatedAt            string                 `json:"createdAt"`
	RecentCases          []PhysicianCaseHistory `json:"recentCases"`
}

// CreatePhysicianInput carries the fields for creating a new physician account.
type CreatePhysicianInput struct {
	Name              string `json:"name"`
	Email             string `json:"email"`
	Password          string `json:"password"`
	Specialization    string `json:"specialization"`
	Phone             string `json:"phone"`
	YearsOfExperience string `json:"yearsOfExperience"`
	CertificateName   string `json:"certificateName"`
	CertificateID     string `json:"certificateId"`
}

// UpdatePhysicianInput carries the fields that an admin can update.
type UpdatePhysicianInput struct {
	Name              string `json:"name"`
	Email             string `json:"email"`
	Specialization    string `json:"specialization"`
	Phone             string `json:"phone"`
	YearsOfExperience string `json:"yearsOfExperience"`
}

// CaseFilters controls admin case list filtering and pagination.
type CaseFilters struct {
	Status   string // "Pending" | "Active" | "Completed" | "" (all)
	Urgency  string // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | ""
	Category string // "general_health" | "doctor_consultation" | "" (all)
	Search   string // free-text search on title / condition / patient name
	Page     int
	PageSize int
}

// SLABreachAlert is a record from sla_reassignment_log for the admin alert panel.
type SLABreachAlert struct {
	ID                    string `json:"id"`
	CaseID                string `json:"caseId"`
	CaseTitle             string `json:"caseTitle"`
	Urgency               string `json:"urgency"`
	WaitSeconds           int64  `json:"waitSeconds"`
	WaitFormatted         string `json:"waitFormatted"`
	OriginalPhysicianName string `json:"originalPhysicianName,omitempty"`
	NewPhysicianName      string `json:"newPhysicianName,omitempty"`
	NatsPublished         bool   `json:"natsPublished"`
	CreatedAt             string `json:"createdAt"`
}

// AuditEvent is a single row from the audit_events table.
type AuditEvent struct {
	ID         string      `json:"id"`
	EventType  string      `json:"eventType"`
	ActorID    string      `json:"actorId,omitempty"`
	ActorRole  string      `json:"actorRole"`
	ActorName  string      `json:"actorName,omitempty"`
	Resource   string      `json:"resource"`
	ResourceID string      `json:"resourceId,omitempty"`
	OldValue   interface{} `json:"oldValue,omitempty"`
	NewValue   interface{} `json:"newValue,omitempty"`
	IPAddress  string      `json:"ipAddress,omitempty"`
	Metadata   interface{} `json:"metadata,omitempty"`
	CreatedAt  string      `json:"createdAt"`
}

// AuditFilters controls audit log filtering.
type AuditFilters struct {
	EventType string
	ActorRole string
	Resource  string
	DateFrom  string
	DateTo    string
	Page      int
	PageSize  int
}

// AdminTransactionRow is a payment transaction row enriched with patient info.
type AdminTransactionRow struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	PatientName    string `json:"patientName"`
	PatientEmail   string `json:"patientEmail"`
	TxRef          string `json:"txRef"`
	FlwTxID        string `json:"flwTxId,omitempty"`
	Amount         int    `json:"amount"`
	CreditsGranted int    `json:"creditsGranted"`
	Status         string `json:"status"`
	BundleID       string `json:"bundleId"`
	CreatedAt      string `json:"createdAt"`
}

// NDPASnapshot is a stored NDPA 2023 compliance snapshot.
type NDPASnapshot struct {
	ID                  string  `json:"id"`
	SnapshotDate        string  `json:"snapshotDate"`
	TotalDataSubjects   int     `json:"totalDataSubjects"`
	ConsentCapturedPct  float64 `json:"consentCapturedPct"`
	DataMinimisationOk  bool    `json:"dataMinimisationOk"`
	RetentionPolicyOk   bool    `json:"retentionPolicyOk"`
	BreachIncidents30d  int     `json:"breachIncidents30d"`
	PendingDSAR         int     `json:"pendingDsar"`
	Notes               string  `json:"notes"`
	CreatedAt           string  `json:"createdAt"`
}

// AlertThreshold is a configurable system threshold.
type AlertThreshold struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Description string  `json:"description"`
	Value       float64 `json:"value"`
	Unit        string  `json:"unit"`
	Category    string  `json:"category"`
	Enabled     bool    `json:"enabled"`
	UpdatedAt   string  `json:"updatedAt"`
	UpdatedBy   string  `json:"updatedBy,omitempty"`
}

// ─── Repository ───────────────────────────────────────────────────────────────

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// GetAllCases returns a filtered, paginated list of all diagnoses for admin management.
func (r *Repository) GetAllCases(f CaseFilters) ([]CaseRow, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}
	offset := (f.Page - 1) * f.PageSize

	// Build dynamic WHERE clause.
	where := "WHERE 1=1"
	args := []interface{}{}
	argN := 1

	if f.Status != "" {
		where += fmt.Sprintf(" AND d.status = $%d", argN)
		args = append(args, f.Status)
		argN++
	}
	if f.Urgency != "" {
		where += fmt.Sprintf(" AND d.urgency = $%d", argN)
		args = append(args, f.Urgency)
		argN++
	}
	if f.Category != "" {
		where += fmt.Sprintf(" AND s.category = $%d", argN)
		args = append(args, f.Category)
		argN++
	}
	if f.Search != "" {
		pattern := "%" + f.Search + "%"
		where += fmt.Sprintf(" AND (d.title ILIKE $%d OR d.condition ILIKE $%d OR u.name ILIKE $%d)", argN, argN+1, argN+2)
		args = append(args, pattern, pattern, pattern)
		argN += 3
	}

	// Count query.
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		LEFT JOIN chat_sessions s ON s.user_id = d.user_id AND s.status = 'completed'
		%s`, where)

	var total int
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Data query.
	limitArgs := append(args, f.PageSize, offset)
	dataQuery := fmt.Sprintf(`
		SELECT d.id, u.name, u.email,
		       COALESCE(d.title,''), COALESCE(d.condition,''), COALESCE(d.urgency,''),
		       d.status, COALESCE(s.category,''), d.escalated,
		       COALESCE((d.ai_response->'diagnosis'->>'confidence')::int, 0),
		       COALESCE(p.name,''),
		       d.created_at::text, d.updated_at::text
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		LEFT JOIN users p ON p.id = d.physician_id
		LEFT JOIN LATERAL (
		    SELECT category FROM chat_sessions
		    WHERE user_id = d.user_id AND status = 'completed'
		    ORDER BY updated_at DESC LIMIT 1
		) s ON true
		%s
		ORDER BY d.created_at DESC
		LIMIT $%d OFFSET $%d`, where, argN, argN+1)

	rows, err := r.db.Query(dataQuery, limitArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var cases []CaseRow
	for rows.Next() {
		var c CaseRow
		if err := rows.Scan(
			&c.ID, &c.PatientName, &c.PatientEmail,
			&c.Title, &c.Condition, &c.Urgency,
			&c.Status, &c.Category, &c.Escalated,
			&c.Confidence, &c.PhysicianName,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		cases = append(cases, c)
	}
	return cases, total, rows.Err()
}

// GetDashboardStats returns live counts for the admin dashboard.
func (r *Repository) GetDashboardStats() (*DashboardStats, error) {
	stats := &DashboardStats{CasesByStatus: map[string]int{}}

	// Case counts by status.
	rows, err := r.db.Query(`
		SELECT status, COUNT(*) FROM diagnoses GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var cnt int
		if err := rows.Scan(&status, &cnt); err != nil {
			return nil, err
		}
		stats.CasesByStatus[status] = cnt
		stats.TotalCases += cnt
	}

	// Physician counts.
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM users WHERE role = 'professional'`,
	).Scan(&stats.TotalPhysicians); err != nil {
		return nil, err
	}

	// Available physicians = those with no Active cases right now.
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM users u
		WHERE u.role = 'professional'
		  AND NOT EXISTS (
		      SELECT 1 FROM diagnoses d
		      WHERE d.physician_id = u.id AND d.status = 'Active'
		  )`,
	).Scan(&stats.AvailablePhysicians); err != nil {
		return nil, err
	}

	// Active users in last 7 days (users with at least one diagnosis).
	if err := r.db.QueryRow(`
		SELECT COUNT(DISTINCT user_id) FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '7 days'`,
	).Scan(&stats.ActiveUsers7d); err != nil {
		return nil, err
	}

	// Total patients.
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM users WHERE role = 'user'`,
	).Scan(&stats.TotalPatients); err != nil {
		return nil, err
	}

	// Escalated today.
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM diagnoses
		WHERE escalated = true AND created_at >= CURRENT_DATE`,
	).Scan(&stats.EscalatedToday); err != nil {
		return nil, err
	}

	// Completed today.
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM diagnoses
		WHERE status = 'Completed' AND updated_at >= CURRENT_DATE`,
	).Scan(&stats.CompletedToday); err != nil {
		return nil, err
	}

	return stats, nil
}

// GetSLAReport returns all Pending cases with time-in-queue.
func (r *Repository) GetSLAReport() ([]SLAItem, error) {
	rows, err := r.db.Query(`
		SELECT id, COALESCE(title,''), COALESCE(urgency,'LOW'),
		       EXTRACT(EPOCH FROM (NOW() - created_at))::bigint,
		       created_at::text
		FROM diagnoses
		WHERE status = 'Pending' AND physician_id IS NULL
		ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []SLAItem
	for rows.Next() {
		var item SLAItem
		if err := rows.Scan(&item.ID, &item.Title, &item.Urgency, &item.SecondsWait, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.SLAColor = slaColor(item.SecondsWait, item.Urgency)
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetEDISMetrics returns aggregated EDIS performance metrics for the given period.
func (r *Repository) GetEDISMetrics(days int) (*EDISMetrics, error) {
	if days <= 0 {
		days = 30
	}
	interval := fmt.Sprintf("%d days", days)
	metrics := &EDISMetrics{PeriodDays: days}

	// Total + escalation counts.
	if err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*),
		    COUNT(*) FILTER (WHERE escalated = true)
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%s'`, interval),
	).Scan(&metrics.TotalDiagnoses, &metrics.EscalationCount); err != nil {
		return nil, err
	}

	if metrics.TotalDiagnoses > 0 {
		metrics.EscalationRatePct = float64(metrics.EscalationCount) / float64(metrics.TotalDiagnoses) * 100
	}

	// Avg confidence + low-confidence count (confidence < 60).
	if err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COALESCE(AVG(NULLIF((ai_response->'diagnosis'->>'confidence'),'')::int), 0),
		    COUNT(*) FILTER (
		        WHERE (ai_response->'diagnosis'->>'confidence') IS NOT NULL
		          AND (ai_response->'diagnosis'->>'confidence')::int > 0
		          AND (ai_response->'diagnosis'->>'confidence')::int < 60
		    )
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%s'
		  AND ai_response IS NOT NULL`, interval),
	).Scan(&metrics.AvgConfidence, &metrics.LowConfidenceCount); err != nil {
		return nil, err
	}

	if metrics.TotalDiagnoses > 0 {
		metrics.LowConfidencePct = float64(metrics.LowConfidenceCount) / float64(metrics.TotalDiagnoses) * 100
	}

	// Avg conditions per case.
	if err := r.db.QueryRow(fmt.Sprintf(`
		SELECT COALESCE(AVG(jsonb_array_length(ai_response->'conditions')), 0)
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%s'
		  AND ai_response IS NOT NULL
		  AND jsonb_typeof(ai_response->'conditions') = 'array'`, interval),
	).Scan(&metrics.AvgConditionsPerCase); err != nil {
		return nil, err
	}

	// Risk flag frequency — unnest the riskFlags array.
	flagRows, err := r.db.Query(fmt.Sprintf(`
		SELECT flag, COUNT(*) AS cnt
		FROM (
		    SELECT jsonb_array_elements(ai_response->'riskFlags')->>'flag' AS flag
		    FROM diagnoses
		    WHERE created_at >= NOW() - INTERVAL '%s'
		      AND ai_response IS NOT NULL
		      AND jsonb_typeof(ai_response->'riskFlags') = 'array'
		) sub
		WHERE flag IS NOT NULL AND flag != ''
		GROUP BY flag
		ORDER BY cnt DESC
		LIMIT 12`, interval))
	if err != nil {
		return nil, err
	}
	defer flagRows.Close()
	for flagRows.Next() {
		var fc FlagCount
		if err := flagRows.Scan(&fc.Flag, &fc.Count); err != nil {
			return nil, err
		}
		metrics.FlagFrequency = append(metrics.FlagFrequency, fc)
	}
	if metrics.FlagFrequency == nil {
		metrics.FlagFrequency = []FlagCount{}
	}

	return metrics, flagRows.Err()
}

// GetPhysicians returns all physicians with their case load and account management statistics.
func (r *Repository) GetPhysicians() ([]PhysicianRow, error) {
	rows, err := r.db.Query(`
		SELECT u.id, u.name, u.email, COALESCE(u.specialization,''),
		       u.mdcn_verified,
		       COALESCE(u.mdcn_override_status,''),
		       COALESCE(u.account_status,'active'),
		       u.flagged,
		       COALESCE(u.flagged_reason,''),
		       COUNT(d.id) FILTER (WHERE d.status = 'Active')   AS active_cases,
		       COUNT(d.id) FILTER (WHERE d.status = 'Completed') AS completed_cases,
		       (
		           SELECT COUNT(*) FROM physician_sla_breaches b
		           WHERE b.physician_id = u.id
		             AND b.breached_at >= NOW() - INTERVAL '7 days'
		       ) AS sla_breach_week
		FROM users u
		LEFT JOIN diagnoses d ON d.physician_id = u.id
		WHERE u.role = 'professional'
		GROUP BY u.id, u.name, u.email, u.specialization, u.mdcn_verified,
		         u.mdcn_override_status, u.account_status, u.flagged, u.flagged_reason
		ORDER BY u.flagged DESC, active_cases DESC, u.name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var physicians []PhysicianRow
	for rows.Next() {
		var p PhysicianRow
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Email, &p.Specialization,
			&p.MdcnVerified, &p.MdcnOverrideStatus, &p.AccountStatus,
			&p.Flagged, &p.FlaggedReason,
			&p.ActiveCases, &p.TotalCompleted, &p.SlaBreachCountWeek,
		); err != nil {
			return nil, err
		}
		p.Available = p.ActiveCases == 0
		physicians = append(physicians, p)
	}
	return physicians, rows.Err()
}

// GetPhysicianDetail returns the full admin profile for a single physician.
func (r *Repository) GetPhysicianDetail(physicianID string) (*PhysicianDetail, error) {
	var d PhysicianDetail
	var flaggedAt, mdcnOverrideAt sql.NullString
	var mdcnOverrideByName sql.NullString

	err := r.db.QueryRow(`
		SELECT u.id, u.name, u.email, COALESCE(u.specialization,''),
		       u.mdcn_verified, COALESCE(u.mdcn_override_status,''),
		       COALESCE(u.account_status,'active'), u.flagged,
		       COALESCE(u.flagged_reason,''), u.flagged_at::text,
		       COALESCE(u.phone,''), COALESCE(u.dob,''), COALESCE(u.gender,''),
		       COALESCE(u.years_of_experience,''), COALESCE(u.certificate_name,''),
		       COALESCE(u.certificate_id,''), COALESCE(u.certificate_issue_date,''),
		       COALESCE(u.certificate_url,''),
		       COALESCE(adm.name,''), u.mdcn_override_at::text,
		       u.created_at::text,
		       (
		           SELECT COUNT(*) FROM physician_sla_breaches b
		           WHERE b.physician_id = u.id
		             AND b.breached_at >= NOW() - INTERVAL '7 days'
		       ) AS sla_week,
		       (
		           SELECT COUNT(*) FROM diagnoses d WHERE d.physician_id = u.id AND d.status = 'Active'
		       ) AS active_cases,
		       (
		           SELECT COUNT(*) FROM diagnoses d WHERE d.physician_id = u.id AND d.status = 'Completed'
		       ) AS completed_cases
		FROM users u
		LEFT JOIN users adm ON adm.id = u.mdcn_override_by
		WHERE u.id = $1::uuid AND u.role = 'professional'`,
		physicianID,
	).Scan(
		&d.ID, &d.Name, &d.Email, &d.Specialization,
		&d.MdcnVerified, &d.MdcnOverrideStatus,
		&d.AccountStatus, &d.Flagged, &d.FlaggedReason, &flaggedAt,
		&d.Phone, &d.DOB, &d.Gender, &d.YearsOfExperience,
		&d.CertificateName, &d.CertificateID, &d.CertificateIssueDate, &d.CertificateURL,
		&mdcnOverrideByName, &mdcnOverrideAt,
		&d.CreatedAt,
		&d.SlaBreachCountWeek, &d.ActiveCases, &d.TotalCompleted,
	)
	if err != nil {
		return nil, err
	}
	d.Available = d.ActiveCases == 0
	if flaggedAt.Valid {
		d.FlaggedAt = flaggedAt.String
	}
	if mdcnOverrideByName.Valid {
		d.MdcnOverrideBy = mdcnOverrideByName.String
	}
	if mdcnOverrideAt.Valid {
		d.MdcnOverrideAt = mdcnOverrideAt.String
	}

	// Recent case history (last 20).
	caseRows, err := r.db.Query(`
		SELECT id, COALESCE(title,''), COALESCE(condition,''), COALESCE(urgency,'LOW'),
		       status, escalated, created_at::text, updated_at::text
		FROM diagnoses
		WHERE physician_id = $1::uuid
		ORDER BY updated_at DESC
		LIMIT 20`, physicianID)
	if err != nil {
		return nil, err
	}
	defer caseRows.Close()
	for caseRows.Next() {
		var ch PhysicianCaseHistory
		if err := caseRows.Scan(&ch.ID, &ch.Title, &ch.Condition, &ch.Urgency,
			&ch.Status, &ch.Escalated, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			continue
		}
		d.RecentCases = append(d.RecentCases, ch)
	}
	if d.RecentCases == nil {
		d.RecentCases = []PhysicianCaseHistory{}
	}
	return &d, caseRows.Err()
}

// CreatePhysician inserts a new physician account.  The caller must pass a
// bcrypt-hashed password; raw passwords must never reach this layer.
func (r *Repository) CreatePhysician(inp CreatePhysicianInput, passwordHash string) (string, error) {
	var id string
	err := r.db.QueryRow(`
		INSERT INTO users
		    (name, email, password_hash, role, specialization, phone,
		     years_of_experience, certificate_name, certificate_id, account_status)
		VALUES ($1, $2, $3, 'professional', $4, $5, $6, $7, $8, 'active')
		RETURNING id::text`,
		inp.Name, inp.Email, passwordHash, inp.Specialization, inp.Phone,
		inp.YearsOfExperience, inp.CertificateName, inp.CertificateID,
	).Scan(&id)
	return id, err
}

// UpdatePhysician patches mutable fields on a physician account.
func (r *Repository) UpdatePhysician(physicianID string, inp UpdatePhysicianInput) error {
	_, err := r.db.Exec(`
		UPDATE users
		SET name               = COALESCE(NULLIF($2,''), name),
		    email              = COALESCE(NULLIF($3,''), email),
		    specialization     = COALESCE(NULLIF($4,''), specialization),
		    phone              = COALESCE(NULLIF($5,''), phone),
		    years_of_experience = COALESCE(NULLIF($6,''), years_of_experience),
		    updated_at         = NOW()
		WHERE id = $1::uuid AND role = 'professional'`,
		physicianID, inp.Name, inp.Email, inp.Specialization,
		inp.Phone, inp.YearsOfExperience,
	)
	return err
}

// DeletePhysician removes a physician account. Cases remain with physician_id
// set (soft reference) so history is preserved.
func (r *Repository) DeletePhysician(physicianID string) error {
	res, err := r.db.Exec(
		`DELETE FROM users WHERE id = $1::uuid AND role = 'professional'`, physicianID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("physician not found")
	}
	return nil
}

// SuspendPhysician sets account_status = 'suspended' and logs the admin action.
func (r *Repository) SuspendPhysician(physicianID, adminID, reason string) error {
	res, err := r.db.Exec(`
		UPDATE users
		SET account_status = 'suspended', updated_at = NOW()
		WHERE id = $1::uuid AND role = 'professional'`,
		physicianID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("physician not found")
	}
	r.LogAction(adminID, "physician.suspend", "user", &physicianID,
		map[string]interface{}{"reason": reason})
	return nil
}

// UnsuspendPhysician restores account_status = 'active'.
func (r *Repository) UnsuspendPhysician(physicianID, adminID string) error {
	res, err := r.db.Exec(`
		UPDATE users
		SET account_status = 'active', updated_at = NOW()
		WHERE id = $1::uuid AND role = 'professional'`,
		physicianID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("physician not found")
	}
	r.LogAction(adminID, "physician.unsuspend", "user", &physicianID, map[string]interface{}{})
	return nil
}

// OverrideMDCN allows an admin to manually confirm or reject MDCN verification.
// status must be "confirmed" or "rejected".
func (r *Repository) OverrideMDCN(physicianID, adminID, status string) error {
	if status != "confirmed" && status != "rejected" {
		return fmt.Errorf("invalid mdcn override status: must be confirmed or rejected")
	}
	mdcnVerified := status == "confirmed"
	res, err := r.db.Exec(`
		UPDATE users
		SET mdcn_verified         = $2,
		    mdcn_override_status  = $3,
		    mdcn_override_by      = $4::uuid,
		    mdcn_override_at      = NOW(),
		    mdcn_verified_at      = CASE WHEN $2 THEN NOW() ELSE NULL END,
		    updated_at            = NOW()
		WHERE id = $1::uuid AND role = 'professional'`,
		physicianID, mdcnVerified, status, adminID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("physician not found")
	}
	r.LogAction(adminID, "physician.mdcn_override", "user", &physicianID,
		map[string]interface{}{"status": status})
	return nil
}

// CheckAndFlagPhysicians queries all physicians whose SLA breach count in the
// past 7 days is ≥ 3 and marks them flagged.  Returns the number newly flagged.
func (r *Repository) CheckAndFlagPhysicians() (int, error) {
	res, err := r.db.Exec(`
		UPDATE users u
		SET flagged        = TRUE,
		    flagged_at     = NOW(),
		    flagged_reason = '3 or more SLA breaches in the past 7 days',
		    updated_at     = NOW()
		FROM (
		    SELECT physician_id, COUNT(*) AS breach_count
		    FROM physician_sla_breaches
		    WHERE breached_at >= NOW() - INTERVAL '7 days'
		    GROUP BY physician_id
		    HAVING COUNT(*) >= 3
		) sub
		WHERE u.id = sub.physician_id
		  AND u.role = 'professional'
		  AND u.flagged = FALSE`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// RecordSLABreach inserts a physician SLA breach record.
// hoursOver is how many hours past the SLA deadline the case was completed.
func (r *Repository) RecordSLABreach(physicianID, caseID string, hoursOver float64) error {
	_, err := r.db.Exec(`
		INSERT INTO physician_sla_breaches (physician_id, case_id, hours_over_sla)
		VALUES ($1::uuid, $2::uuid, $3)
		ON CONFLICT (physician_id, case_id) DO NOTHING`,
		physicianID, caseID, hoursOver)
	return err
}

// LogAction writes an admin action to the admin_actions audit table.
func (r *Repository) LogAction(adminID, action, resource string, resourceID *string, details map[string]interface{}) {
	detailsJSON, _ := json.Marshal(details)
	var rid interface{}
	if resourceID != nil {
		rid = *resourceID
	}
	_, _ = r.db.Exec(`
		INSERT INTO admin_actions (admin_id, action, resource, resource_id, details)
		VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
		adminID, action, resource, rid, detailsJSON)
}

// GetSLABreachAlerts returns the most recent SLA breach events for the admin
// alert panel (all breaches, including those without a successful reassignment).
func (r *Repository) GetSLABreachAlerts(limit int) ([]SLABreachAlert, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.db.Query(`
		SELECT id::text, case_id::text, case_title, urgency, wait_seconds,
		       original_physician_name, new_physician_name, nats_published, created_at::text
		FROM sla_reassignment_log
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []SLABreachAlert
	for rows.Next() {
		var a SLABreachAlert
		if err := rows.Scan(&a.ID, &a.CaseID, &a.CaseTitle, &a.Urgency, &a.WaitSeconds,
			&a.OriginalPhysicianName, &a.NewPhysicianName, &a.NatsPublished, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.WaitFormatted = FormatWait(a.WaitSeconds)
		alerts = append(alerts, a)
	}
	if alerts == nil {
		alerts = []SLABreachAlert{}
	}
	return alerts, rows.Err()
}

// GetReassignmentLog returns a paginated list of SLA breaches where a
// successful reassignment to a new physician occurred.
func (r *Repository) GetReassignmentLog(page, pageSize int) ([]SLABreachAlert, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var total int
	if err := r.db.QueryRow(`
		SELECT COUNT(*) FROM sla_reassignment_log WHERE new_physician_id IS NOT NULL`,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(`
		SELECT id::text, case_id::text, case_title, urgency, wait_seconds,
		       original_physician_name, new_physician_name, nats_published, created_at::text
		FROM sla_reassignment_log
		WHERE new_physician_id IS NOT NULL
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2`, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []SLABreachAlert
	for rows.Next() {
		var a SLABreachAlert
		if err := rows.Scan(&a.ID, &a.CaseID, &a.CaseTitle, &a.Urgency, &a.WaitSeconds,
			&a.OriginalPhysicianName, &a.NewPhysicianName, &a.NatsPublished, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		a.WaitFormatted = FormatWait(a.WaitSeconds)
		entries = append(entries, a)
	}
	if entries == nil {
		entries = []SLABreachAlert{}
	}
	return entries, total, rows.Err()
}

// ─── Audit log ────────────────────────────────────────────────────────────────

// WriteAuditEvent inserts a structured audit event.
// This is a best-effort helper; errors are logged but not propagated.
func (r *Repository) WriteAuditEvent(actorID, actorRole, eventType, resource, resourceID string, oldVal, newVal, metadata interface{}, ipAddress string) {
	oldJSON, _ := json.Marshal(oldVal)
	newJSON, _ := json.Marshal(newVal)
	metaJSON, _ := json.Marshal(metadata)

	var actorArg, resArg interface{}
	if actorID != "" {
		actorArg = actorID
	}
	if resourceID != "" {
		resArg = resourceID
	}

	_, _ = r.db.Exec(`
		INSERT INTO audit_events
		    (actor_id, actor_role, event_type, resource, resource_id,
		     old_value, new_value, metadata, ip_address)
		VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9)`,
		actorArg, actorRole, eventType, resource, resArg,
		oldJSON, newJSON, metaJSON, ipAddress)
}

// GetAuditEvents returns a filtered, paginated list of audit events.
func (r *Repository) GetAuditEvents(f AuditFilters) ([]AuditEvent, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 200 {
		f.PageSize = 50
	}
	offset := (f.Page - 1) * f.PageSize

	where := "WHERE 1=1"
	args := []interface{}{}
	n := 1

	if f.EventType != "" {
		where += fmt.Sprintf(" AND a.event_type LIKE $%d", n)
		args = append(args, f.EventType+"%")
		n++
	}
	if f.ActorRole != "" {
		where += fmt.Sprintf(" AND a.actor_role = $%d", n)
		args = append(args, f.ActorRole)
		n++
	}
	if f.Resource != "" {
		where += fmt.Sprintf(" AND a.resource = $%d", n)
		args = append(args, f.Resource)
		n++
	}
	if f.DateFrom != "" {
		where += fmt.Sprintf(" AND a.created_at >= $%d::timestamptz", n)
		args = append(args, f.DateFrom)
		n++
	}
	if f.DateTo != "" {
		where += fmt.Sprintf(" AND a.created_at <= $%d::timestamptz", n)
		args = append(args, f.DateTo)
		n++
	}

	var total int
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM audit_events a %s`, where)
	if err := r.db.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limitArgs := append(args, f.PageSize, offset)
	dataQ := fmt.Sprintf(`
		SELECT a.id::text, a.event_type, COALESCE(a.actor_id::text,''),
		       a.actor_role, COALESCE(u.name,''),
		       a.resource, COALESCE(a.resource_id::text,''),
		       a.old_value, a.new_value, COALESCE(a.ip_address,''),
		       a.metadata, a.created_at::text
		FROM audit_events a
		LEFT JOIN users u ON u.id = a.actor_id
		%s
		ORDER BY a.created_at DESC
		LIMIT $%d OFFSET $%d`, where, n, n+1)

	rows, err := r.db.Query(dataQ, limitArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []AuditEvent
	for rows.Next() {
		var e AuditEvent
		var oldRaw, newRaw, metaRaw []byte
		if err := rows.Scan(
			&e.ID, &e.EventType, &e.ActorID, &e.ActorRole, &e.ActorName,
			&e.Resource, &e.ResourceID,
			&oldRaw, &newRaw, &e.IPAddress, &metaRaw, &e.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		_ = json.Unmarshal(oldRaw, &e.OldValue)
		_ = json.Unmarshal(newRaw, &e.NewValue)
		_ = json.Unmarshal(metaRaw, &e.Metadata)
		events = append(events, e)
	}
	if events == nil {
		events = []AuditEvent{}
	}
	return events, total, rows.Err()
}

// ─── Transaction log (admin) ──────────────────────────────────────────────────

// GetAllTransactions returns a paginated list of payment transactions across all users.
func (r *Repository) GetAllTransactions(status string, page, pageSize int) ([]AdminTransactionRow, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	args := []interface{}{}
	n := 1
	where := "WHERE 1=1"
	if status != "" {
		where += fmt.Sprintf(" AND pt.status = $%d", n)
		args = append(args, status)
		n++
	}

	var total int
	if err := r.db.QueryRow(
		fmt.Sprintf(`SELECT COUNT(*) FROM payment_transactions pt %s`, where), args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	limitArgs := append(args, pageSize, offset)
	rows, err := r.db.Query(fmt.Sprintf(`
		SELECT pt.id::text, pt.user_id::text,
		       COALESCE(u.name,''), COALESCE(u.email,''),
		       pt.tx_ref, COALESCE(pt.flw_tx_id,''),
		       pt.amount, pt.credits_granted, pt.status, pt.bundle_id,
		       pt.created_at::text
		FROM payment_transactions pt
		LEFT JOIN users u ON u.id = pt.user_id
		%s
		ORDER BY pt.created_at DESC
		LIMIT $%d OFFSET $%d`, where, n, n+1), limitArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []AdminTransactionRow
	for rows.Next() {
		var t AdminTransactionRow
		if err := rows.Scan(&t.ID, &t.UserID, &t.PatientName, &t.PatientEmail,
			&t.TxRef, &t.FlwTxID, &t.Amount, &t.CreditsGranted, &t.Status, &t.BundleID,
			&t.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	if out == nil {
		out = []AdminTransactionRow{}
	}
	return out, total, rows.Err()
}

// AdjustCredit manually adds or deducts credits for a user and records an
// audit transaction so the change is visible in the admin transaction log.
// A positive amount adds credits; negative deducts (balance floored at 0).
func (r *Repository) AdjustCredit(userID string, amount int, reason, adminID string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var newBalance int
	scanErr := tx.QueryRow(
		`UPDATE credits
		 SET balance = GREATEST(0, balance + $1), updated_at = NOW()
		 WHERE user_id = $2::uuid
		 RETURNING balance`,
		amount, userID,
	).Scan(&newBalance)
	if scanErr == sql.ErrNoRows {
		// User has no credits row yet — create one.
		adj := amount
		if adj < 0 {
			adj = 0
		}
		if _, err := tx.Exec(
			`INSERT INTO credits (user_id, balance, updated_at)
			 VALUES ($1::uuid, $2, NOW())`,
			userID, adj,
		); err != nil {
			return err
		}
		newBalance = adj
	} else if scanErr != nil {
		return scanErr
	}

	// Record in payment_transactions for full audit trail.
	bundleLabel := "admin_credit"
	if amount < 0 {
		bundleLabel = "admin_debit"
	}
	txRef := fmt.Sprintf("ADMIN-ADJ-%s-%d", adminID[:8], time.Now().UnixMilli())
	if _, err := tx.Exec(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id)
		 VALUES ($1::uuid, $2, 0, $3, 'success', $4)`,
		userID, txRef, amount, bundleLabel,
	); err != nil {
		return err
	}

	_ = newBalance // available for future audit-log enrichment
	return tx.Commit()
}

// ─── NDPA compliance ──────────────────────────────────────────────────────────

// GenerateNDPASnapshot computes a live NDPA 2023 compliance snapshot and persists it.
func (r *Repository) GenerateNDPASnapshot() (*NDPASnapshot, error) {
	snap := &NDPASnapshot{}

	// Total unique data subjects (all registered users).
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'user'`).
		Scan(&snap.TotalDataSubjects); err != nil {
		return nil, err
	}

	// Consent captured = users that have completed at least one diagnosis
	// (accepted T&C at registration; NDPA requires per-purpose consent).
	var consentCount int
	if err := r.db.QueryRow(`
		SELECT COUNT(DISTINCT user_id) FROM diagnoses`).Scan(&consentCount); err != nil {
		return nil, err
	}
	if snap.TotalDataSubjects > 0 {
		snap.ConsentCapturedPct = float64(consentCount) / float64(snap.TotalDataSubjects) * 100
	}

	// Data minimisation: we only store what is necessary — flag as OK when no
	// diagnoses have overly-wide AI payloads (heuristic: < 50 KB).
	var bloatedCount int
	_ = r.db.QueryRow(`
		SELECT COUNT(*) FROM diagnoses
		WHERE pg_column_size(ai_response) > 51200`).Scan(&bloatedCount)
	snap.DataMinimisationOk = bloatedCount == 0

	// Retention policy: check that no user data is older than configured retention.
	var oldDataCount int
	_ = r.db.QueryRow(`
		SELECT COUNT(*) FROM diagnoses
		WHERE created_at < NOW() - INTERVAL '7 years'`).Scan(&oldDataCount)
	snap.RetentionPolicyOk = oldDataCount == 0

	// SLA breach incidents in last 30 days approximate "security incidents".
	_ = r.db.QueryRow(`
		SELECT COUNT(*) FROM sla_reassignment_log
		WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&snap.BreachIncidents30d)

	// Pending DSARs: admin audit events of type "dsar.submitted" without a paired "dsar.resolved".
	_ = r.db.QueryRow(`
		SELECT COUNT(*) FROM audit_events
		WHERE event_type = 'dsar.submitted'
		  AND resource_id NOT IN (
		      SELECT resource_id FROM audit_events
		      WHERE event_type = 'dsar.resolved' AND resource_id IS NOT NULL
		  )`).Scan(&snap.PendingDSAR)

	snap.Notes = "Auto-generated snapshot per NDPA 2023 compliance requirements"

	// Persist.
	err := r.db.QueryRow(`
		INSERT INTO ndpa_compliance_snapshots
		    (total_data_subjects, consent_captured_pct, data_minimisation_ok,
		     retention_policy_ok, breach_incidents_30d, pending_dsar, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text, snapshot_date::text, created_at::text`,
		snap.TotalDataSubjects, snap.ConsentCapturedPct,
		snap.DataMinimisationOk, snap.RetentionPolicyOk,
		snap.BreachIncidents30d, snap.PendingDSAR, snap.Notes,
	).Scan(&snap.ID, &snap.SnapshotDate, &snap.CreatedAt)
	if err != nil {
		return nil, err
	}
	return snap, nil
}

// GetNDPASnapshots returns recent compliance snapshots.
func (r *Repository) GetNDPASnapshots(limit int) ([]NDPASnapshot, error) {
	if limit <= 0 || limit > 90 {
		limit = 30
	}
	rows, err := r.db.Query(`
		SELECT id::text, snapshot_date::text, total_data_subjects,
		       consent_captured_pct, data_minimisation_ok, retention_policy_ok,
		       breach_incidents_30d, pending_dsar, notes, created_at::text
		FROM ndpa_compliance_snapshots
		ORDER BY snapshot_date DESC, created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NDPASnapshot
	for rows.Next() {
		var s NDPASnapshot
		if err := rows.Scan(&s.ID, &s.SnapshotDate, &s.TotalDataSubjects,
			&s.ConsentCapturedPct, &s.DataMinimisationOk, &s.RetentionPolicyOk,
			&s.BreachIncidents30d, &s.PendingDSAR, &s.Notes, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if out == nil {
		out = []NDPASnapshot{}
	}
	return out, rows.Err()
}

// ─── Alert thresholds ─────────────────────────────────────────────────────────

// GetAlertThresholds fetches all configurable alert thresholds.
func (r *Repository) GetAlertThresholds() ([]AlertThreshold, error) {
	rows, err := r.db.Query(`
		SELECT t.key, t.label, t.description, t.value::float8, t.unit, t.category,
		       t.enabled, t.updated_at::text, COALESCE(u.name,'')
		FROM alert_thresholds t
		LEFT JOIN users u ON u.id = t.updated_by
		ORDER BY t.category, t.key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AlertThreshold
	for rows.Next() {
		var t AlertThreshold
		if err := rows.Scan(&t.Key, &t.Label, &t.Description, &t.Value,
			&t.Unit, &t.Category, &t.Enabled, &t.UpdatedAt, &t.UpdatedBy); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// UpdateAlertThreshold updates a single threshold's value and enabled flag.
func (r *Repository) UpdateAlertThreshold(adminID, key string, value float64, enabled bool) error {
	var adminArg interface{}
	if adminID != "" {
		adminArg = adminID
	}
	res, err := r.db.Exec(`
		UPDATE alert_thresholds
		SET value = $1, enabled = $2, updated_at = NOW(), updated_by = $3::uuid
		WHERE key = $4`, value, enabled, adminArg, key)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("threshold key not found: %s", key)
	}
	return nil
}

// BuildAuditCSV generates a CSV export of audit events matching the supplied filters.
// Returns raw CSV bytes (UTF-8, with BOM for Excel compatibility).
func (r *Repository) BuildAuditCSV(f AuditFilters) ([]byte, error) {
	// Remove pagination — return all matching rows (capped at 10 000).
	f.Page = 1
	f.PageSize = 10000
	events, _, err := r.GetAuditEvents(f)
	if err != nil {
		return nil, err
	}

	var buf []byte
	// UTF-8 BOM
	buf = append(buf, 0xEF, 0xBB, 0xBF)
	header := "ID,Event Type,Actor Role,Actor Name,Resource,Resource ID,IP Address,Created At\n"
	buf = append(buf, []byte(header)...)
	for _, e := range events {
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s\n",
			csvEscape(e.ID), csvEscape(e.EventType), csvEscape(e.ActorRole),
			csvEscape(e.ActorName), csvEscape(e.Resource), csvEscape(e.ResourceID),
			csvEscape(e.IPAddress), csvEscape(e.CreatedAt))
		buf = append(buf, []byte(line)...)
	}
	return buf, nil
}

// BuildTransactionCSV generates a CSV export of all payment transactions.
func (r *Repository) BuildTransactionCSV(status string) ([]byte, error) {
	txns, _, err := r.GetAllTransactions(status, 1, 10000)
	if err != nil {
		return nil, err
	}

	var buf []byte
	buf = append(buf, 0xEF, 0xBB, 0xBF)
	header := "ID,Patient Name,Patient Email,TX Ref,FLW TX ID,Amount (NGN),Credits,Status,Bundle,Created At\n"
	buf = append(buf, []byte(header)...)
	for _, t := range txns {
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%d,%d,%s,%s,%s\n",
			csvEscape(t.ID), csvEscape(t.PatientName), csvEscape(t.PatientEmail),
			csvEscape(t.TxRef), csvEscape(t.FlwTxID),
			t.Amount, t.CreditsGranted,
			csvEscape(t.Status), csvEscape(t.BundleID), csvEscape(t.CreatedAt))
		buf = append(buf, []byte(line)...)
	}
	return buf, nil
}

// csvEscape wraps a field in double-quotes and escapes internal quotes.
func csvEscape(s string) string {
	// Wrap every field in quotes for safety.
	escaped := `"` + replaceAll(s, `"`, `""`) + `"`
	return escaped
}

// replaceAll is a simple string replacement without importing strings package at type level.
func replaceAll(s, old, new string) string {
	result := make([]byte, 0, len(s))
	for i := 0; i < len(s); {
		if i+len(old) <= len(s) && s[i:i+len(old)] == old {
			result = append(result, []byte(new)...)
			i += len(old)
		} else {
			result = append(result, s[i])
			i++
		}
	}
	return string(result)
}

const (
	slaGreenSecs  = 4 * 3600  // < 4 h → green
	slaYellowSecs = 24 * 3600 // 4–24 h → yellow ; > 24 h → red
)

// slaColor returns the colour tier for time-in-queue.
// HIGH/CRITICAL cases have tighter thresholds (half the normal values).
func slaColor(secondsWait int64, urgency string) string {
	green, yellow := int64(slaGreenSecs), int64(slaYellowSecs)
	if urgency == "HIGH" || urgency == "CRITICAL" {
		green /= 2
		yellow /= 2
	}
	switch {
	case secondsWait < green:
		return "green"
	case secondsWait < yellow:
		return "yellow"
	default:
		return "red"
	}
}

// formatDuration converts seconds to a human-readable string.
func formatDuration(seconds int64) string {
	d := time.Duration(seconds) * time.Second
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

// FormatWait returns a human-readable wait time (exported for handler use).
func FormatWait(seconds int64) string { return formatDuration(seconds) }
