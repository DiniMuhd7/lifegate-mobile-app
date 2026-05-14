// Package pubinsights provides two public analytics endpoints:
//  1. Telemedicine utilization rates
//  2. Compliance & NDPA governance summary
package pubinsights

import (
	"database/sql"
	"fmt"
	"time"
)

// Repository reads from diagnoses, chat_sessions, audit_events, and
// ndpa_compliance_snapshots. All queries return only aggregate statistics —
// no personally identifiable information is exposed.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ─── Telemedicine ────────────────────────────────────────────────────────────

// WeeklyTelePoint holds consultation counts for one ISO week.
type WeeklyTelePoint struct {
	WeekStart        string  `json:"weekStart"` // "YYYY-MM-DD"
	TotalConsults    int     `json:"totalConsults"`
	PhysicianReview  int     `json:"physicianReviewed"`
	CompletionRate   float64 `json:"completionRate"`
}

// StateTeleRow holds utilization stats for one state.
type StateTeleRow struct {
	State           string  `json:"state"`
	TotalConsults   int     `json:"totalConsults"`
	PhysicianReview int     `json:"physicianReviewed"`
	CompletionRate  float64 `json:"completionRate"`
}

// TeleStats is the full payload for the telemedicine endpoint.
type TeleStats struct {
	TotalConsults      int               `json:"totalConsults"`
	PhysicianReviewed  int               `json:"physicianReviewed"`
	NationalCompletion float64           `json:"nationalCompletionRate"`
	SessionsStarted    int               `json:"sessionsStarted"`
	SessionsCompleted  int               `json:"sessionsCompleted"`
	SessionCompletion  float64           `json:"sessionCompletionRate"`
	WeeklyTrend        []WeeklyTelePoint `json:"weeklyTrend"`
	ByState            []StateTeleRow    `json:"byState"`
}

// GetTeleStats returns telemedicine utilization metrics for the given window.
func (r *Repository) GetTeleStats(weeksBack int) (*TeleStats, error) {
	stats := &TeleStats{}

	// 1. National totals from diagnoses.
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*)                                                             AS total,
		    COUNT(CASE WHEN d.physician_id IS NOT NULL THEN 1 END)             AS physician_reviewed
		FROM diagnoses d
		WHERE d.created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(&stats.TotalConsults, &stats.PhysicianReviewed)
	if err != nil {
		return nil, fmt.Errorf("national totals: %w", err)
	}
	if stats.TotalConsults > 0 {
		stats.NationalCompletion = round2(float64(stats.PhysicianReviewed) / float64(stats.TotalConsults) * 100)
	}

	// 2. Chat session totals.
	err = r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*),
		    COUNT(CASE WHEN status = 'completed' THEN 1 END)
		FROM chat_sessions
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(&stats.SessionsStarted, &stats.SessionsCompleted)
	if err != nil {
		return nil, fmt.Errorf("session totals: %w", err)
	}
	if stats.SessionsStarted > 0 {
		stats.SessionCompletion = round2(float64(stats.SessionsCompleted) / float64(stats.SessionsStarted) * 100)
	}

	// 3. Weekly trend.
	trendRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    DATE_TRUNC('week', d.created_at)::date                             AS week_start,
		    COUNT(*)                                                             AS total,
		    COUNT(CASE WHEN d.physician_id IS NOT NULL THEN 1 END)             AS physician_reviewed
		FROM diagnoses d
		WHERE d.created_at >= NOW() - INTERVAL '%d weeks'
		GROUP BY DATE_TRUNC('week', d.created_at)
		ORDER BY week_start
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("weekly trend: %w", err)
	}
	defer trendRows.Close()
	for trendRows.Next() {
		var ws time.Time
		var total, phys int
		if err := trendRows.Scan(&ws, &total, &phys); err != nil {
			return nil, err
		}
		rate := 0.0
		if total > 0 {
			rate = round2(float64(phys) / float64(total) * 100)
		}
		stats.WeeklyTrend = append(stats.WeeklyTrend, WeeklyTelePoint{
			WeekStart:       ws.Format("2006-01-02"),
			TotalConsults:   total,
			PhysicianReview: phys,
			CompletionRate:  rate,
		})
	}
	if err := trendRows.Err(); err != nil {
		return nil, err
	}

	// 4. By-state breakdown (patient state, k-anon threshold = 3).
	stateRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    COALESCE(u.state, 'Unknown')                                        AS state,
		    COUNT(*)                                                             AS total,
		    COUNT(CASE WHEN d.physician_id IS NOT NULL THEN 1 END)             AS physician_reviewed
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - INTERVAL '%d weeks'
		  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
		  AND u.role = 'user'
		GROUP BY COALESCE(u.state, 'Unknown')
		HAVING COUNT(*) >= 3
		ORDER BY total DESC
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("by-state: %w", err)
	}
	defer stateRows.Close()
	for stateRows.Next() {
		var s StateTeleRow
		if err := stateRows.Scan(&s.State, &s.TotalConsults, &s.PhysicianReview); err != nil {
			return nil, err
		}
		if s.TotalConsults > 0 {
			s.CompletionRate = round2(float64(s.PhysicianReview) / float64(s.TotalConsults) * 100)
		}
		stats.ByState = append(stats.ByState, s)
	}
	return stats, stateRows.Err()
}

// ─── Compliance ───────────────────────────────────────────────────────────────

// CategoryCount holds event counts for one audit event category.
type CategoryCount struct {
	Category string `json:"category"`
	Count    int    `json:"count"`
}

// NDPASnapshot mirrors the most recent ndpa_compliance_snapshots row.
type NDPASnapshot struct {
	SnapshotDate        string  `json:"snapshotDate"`
	TotalDataSubjects   int     `json:"totalDataSubjects"`
	ConsentCapturedPct  float64 `json:"consentCapturedPct"`
	DataMinimisationOk  bool    `json:"dataMinimisationOk"`
	RetentionPolicyOk   bool    `json:"retentionPolicyOk"`
	BreachIncidents30d  int     `json:"breachIncidents30d"`
	PendingDSAR         int     `json:"pendingDsar"`
}

// ComplianceSummary is the full payload for the compliance endpoint.
type ComplianceSummary struct {
	AuditEvents30d  int              `json:"auditEvents30d"`
	ByCategory      []CategoryCount  `json:"byCategory"`
	NDPASnapshot    *NDPASnapshot    `json:"ndpaSnapshot"`
	DataSubjects    int              `json:"dataSubjects"`
	NDPACompliant   bool             `json:"ndpaCompliant"`
}

// GetComplianceSummary returns aggregate audit + NDPA metrics safe for public
// display. No individual event details or PII are included.
func (r *Repository) GetComplianceSummary() (*ComplianceSummary, error) {
	c := &ComplianceSummary{}

	// 1. Total audit events in the last 30 days.
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM audit_events
		WHERE created_at >= NOW() - INTERVAL '30 days'
	`).Scan(&c.AuditEvents30d)
	if err != nil {
		return nil, fmt.Errorf("audit count: %w", err)
	}

	// 2. Events by category (last 30 days).
	catRows, err := r.db.Query(`
		SELECT
		    CASE
		        WHEN event_type LIKE 'case.%'    THEN 'Case Lifecycle'
		        WHEN event_type LIKE 'auth.%'    THEN 'Authentication'
		        WHEN event_type LIKE 'payment.%' THEN 'Payments'
		        WHEN event_type LIKE 'admin.%'   THEN 'Administration'
		        WHEN event_type LIKE 'dsar.%'    THEN 'DSAR Requests'
		        WHEN event_type LIKE 'data.%'    THEN 'Data Operations'
		        ELSE 'System'
		    END AS category,
		    COUNT(*) AS cnt
		FROM audit_events
		WHERE created_at >= NOW() - INTERVAL '30 days'
		GROUP BY 1
		ORDER BY cnt DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("by category: %w", err)
	}
	defer catRows.Close()
	for catRows.Next() {
		var cat CategoryCount
		if err := catRows.Scan(&cat.Category, &cat.Count); err != nil {
			return nil, err
		}
		c.ByCategory = append(c.ByCategory, cat)
	}
	if err := catRows.Err(); err != nil {
		return nil, err
	}

	// 3. Latest NDPA compliance snapshot.
	snap := &NDPASnapshot{}
	var snapDate time.Time
	err = r.db.QueryRow(`
		SELECT snapshot_date, total_data_subjects, consent_captured_pct,
		       data_minimisation_ok, retention_policy_ok,
		       breach_incidents_30d, pending_dsar
		FROM ndpa_compliance_snapshots
		ORDER BY snapshot_date DESC, created_at DESC
		LIMIT 1
	`).Scan(
		&snapDate, &snap.TotalDataSubjects, &snap.ConsentCapturedPct,
		&snap.DataMinimisationOk, &snap.RetentionPolicyOk,
		&snap.BreachIncidents30d, &snap.PendingDSAR,
	)
	if err == sql.ErrNoRows {
		snap = nil
	} else if err != nil {
		return nil, fmt.Errorf("ndpa snapshot: %w", err)
	} else {
		snap.SnapshotDate = snapDate.Format("2006-01-02")
	}
	c.NDPASnapshot = snap

	// 4. Total active data subjects (patients on the platform).
	err = r.db.QueryRow(`
		SELECT COUNT(*) FROM users WHERE role = 'user'
	`).Scan(&c.DataSubjects)
	if err != nil {
		return nil, fmt.Errorf("data subjects: %w", err)
	}

	// 5. Compliance flag: snapshot exists AND no recent breaches AND DSAR < 10.
	if snap != nil {
		c.NDPACompliant = snap.DataMinimisationOk &&
			snap.RetentionPolicyOk &&
			snap.BreachIncidents30d == 0
	}

	return c, nil
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
