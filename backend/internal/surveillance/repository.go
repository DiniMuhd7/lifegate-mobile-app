// Package surveillance implements the Disease Surveillance & Early Warning
// module for the LifeGate Public Health Analytics Dashboard.
//
// All data exposed by this package is aggregated and anonymised at
// state-level — no patient identifiers are ever queried or returned.
// A minimum k-anonymity threshold of 3 cases is enforced on every
// public-facing query to prevent inference attacks on sparse regions.
package surveillance

import (
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

// kAnonThreshold is the minimum case count required before a
// (condition, state, week) cell is included in any public response.
// Prevents re-identification in sparse regions.
const kAnonThreshold = 3

// rollingWindowWeeks is the number of historical weeks used to compute
// the rolling average and standard deviation for anomaly detection.
const rollingWindowWeeks = 8

// Repository handles all surveillance database operations.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ─── Domain types ─────────────────────────────────────────────────────────────

// ConditionCount is a single (condition, state, week) aggregate cell.
type ConditionCount struct {
	ConditionName  string    `json:"conditionName"`
	State          string    `json:"state"`
	Country        string    `json:"country"`
	PeriodStart    time.Time `json:"periodStart"`
	PeriodEnd      time.Time `json:"periodEnd"`
	CaseCount      int       `json:"caseCount"`
	EscalatedCount int       `json:"escalatedCount"`
	AvgConfidence  float64   `json:"avgConfidence"`
}

// Anomaly is a detected outbreak signal.
type Anomaly struct {
	ID            string    `json:"id"`
	ConditionName string    `json:"conditionName"`
	State         string    `json:"state"`
	Country       string    `json:"country"`
	PeriodStart   time.Time `json:"periodStart"`
	CurrentCount  int       `json:"currentCount"`
	RollingAvg    float64   `json:"rollingAvg"`
	RollingStddev float64   `json:"rollingStddev"`
	ZScore        float64   `json:"zScore"`
	Severity      string    `json:"severity"` // "mild" | "moderate" | "severe"
	IsActive      bool      `json:"isActive"`
	DetectedAt    time.Time `json:"detectedAt"`
}

// TrendPoint is one week bucket in a condition trend series.
type TrendPoint struct {
	PeriodStart string `json:"periodStart"` // "YYYY-MM-DD"
	CaseCount   int    `json:"caseCount"`
}

// ConditionTrend is the weekly trend series for a single condition.
type ConditionTrend struct {
	ConditionName string       `json:"conditionName"`
	TotalCases    int          `json:"totalCases"`
	Points        []TrendPoint `json:"points"`
}

// StateBreakdown is per-state aggregate for a condition.
type StateBreakdown struct {
	State     string `json:"state"`
	CaseCount int    `json:"caseCount"`
}

// ConditionStateRow is one condition with its per-state breakdown.
type ConditionStateRow struct {
	ConditionName string           `json:"conditionName"`
	TotalCases    int              `json:"totalCases"`
	States        []StateBreakdown `json:"states"`
}

// SummaryStats is the headline numbers returned by the summary endpoint.
type SummaryStats struct {
	TotalConditionsTracked int       `json:"totalConditionsTracked"`
	TotalCasesThisWeek     int       `json:"totalCasesThisWeek"`
	TotalCasesLast30Days   int       `json:"totalCasesLast30Days"`
	ActiveAnomalies        int       `json:"activeAnomalies"`
	StatesWithSignal       int       `json:"statesWithSignal"`
	LastUpdated            time.Time `json:"lastUpdated"`
}

// ─── Aggregate computation ────────────────────────────────────────────────────

// isoWeekStart returns the Monday of the ISO week containing t.
func isoWeekStart(t time.Time) time.Time {
	t = t.UTC().Truncate(24 * time.Hour)
	offset := int(t.Weekday())
	if offset == 0 {
		offset = 7
	}
	return t.AddDate(0, 0, -(offset - 1))
}

// ComputeAndUpsertWeeklyCounts reads from diagnoses + users for the given
// week and upserts aggregate rows into surveillance_condition_counts.
// Only conditions with at least kAnonThreshold cases are written.
func (r *Repository) ComputeAndUpsertWeeklyCounts(weekStart time.Time) (int, error) {
	weekEnd := weekStart.AddDate(0, 0, 6)

	// Raw query: join diagnoses → users on state, filter by week, group.
	// - condition is stored in the diagnoses.condition column (VARCHAR)
	// - state from users.state (may be NULL → coalesced to 'Unknown')
	// - confidence extracted from ai_response JSONB
	// Only completed cases are included (physician-validated).
	const q = `
		SELECT
			COALESCE(NULLIF(TRIM(d.condition), ''), 'Unspecified') AS condition_name,
			COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown')         AS state,
			COALESCE(NULLIF(TRIM(u.country), ''), 'Nigeria')       AS country,
			COUNT(*)                                                AS case_count,
			SUM(CASE WHEN d.escalated THEN 1 ELSE 0 END)           AS escalated_count,
			AVG(
				COALESCE(
					(d.ai_response -> 'diagnosis' ->> 'confidence')::NUMERIC,
					0
				)
			)                                                       AS avg_confidence
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.status = 'Completed'
		  AND d.created_at >= $1
		  AND d.created_at <  $2
		GROUP BY condition_name, state, country
		HAVING COUNT(*) >= $3
	`

	rows, err := r.db.Query(q, weekStart, weekEnd.AddDate(0, 0, 1), kAnonThreshold)
	if err != nil {
		return 0, fmt.Errorf("surveillance: query weekly counts: %w", err)
	}
	defer rows.Close()

	type rawRow struct {
		condition     string
		state         string
		country       string
		caseCount     int
		escalatedCount int
		avgConfidence float64
	}

	var upserted int
	for rows.Next() {
		var rr rawRow
		if err := rows.Scan(
			&rr.condition, &rr.state, &rr.country,
			&rr.caseCount, &rr.escalatedCount, &rr.avgConfidence,
		); err != nil {
			continue
		}
		_, err := r.db.Exec(`
			INSERT INTO surveillance_condition_counts
				(condition_name, state, country, period_start, period_end,
				 period_type, case_count, escalated_count, avg_confidence, computed_at)
			VALUES ($1, $2, $3, $4, $5, 'weekly', $6, $7, $8, NOW())
			ON CONFLICT (condition_name, state, country, period_start, period_type)
			DO UPDATE SET
				case_count      = EXCLUDED.case_count,
				escalated_count = EXCLUDED.escalated_count,
				avg_confidence  = EXCLUDED.avg_confidence,
				computed_at     = NOW()
		`, rr.condition, rr.state, rr.country, weekStart, weekEnd,
			rr.caseCount, rr.escalatedCount, rr.avgConfidence)
		if err != nil {
			continue
		}
		upserted++
	}
	return upserted, rows.Err()
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

// AnomalyCandidate is returned by the rolling-window query for one (condition, state).
type AnomalyCandidate struct {
	ConditionName  string
	State          string
	Country        string
	PeriodStart    time.Time
	CurrentCount   int
	RollingAvg     float64
	RollingStddev  float64
}

// GetAnomalyCandidates fetches the current week's counts alongside the
// rolling 8-week average and stddev for every (condition, state) pair.
// Only rows where current_count > rolling_avg + 2*rolling_stddev are returned.
func (r *Repository) GetAnomalyCandidates(weekStart time.Time) ([]AnomalyCandidate, error) {
	// The window covers the rollingWindowWeeks weeks immediately before weekStart.
	windowStart := weekStart.AddDate(0, 0, -7*rollingWindowWeeks)

	const q = `
		WITH historical AS (
			SELECT
				condition_name,
				state,
				country,
				AVG(case_count::FLOAT)    AS rolling_avg,
				STDDEV(case_count::FLOAT) AS rolling_stddev
			FROM surveillance_condition_counts
			WHERE period_type  = 'weekly'
			  AND period_start >= $1
			  AND period_start <  $2
			GROUP BY condition_name, state, country
			HAVING COUNT(*) >= 4  -- need at least 4 historical weeks for stable stddev
		),
		current_week AS (
			SELECT condition_name, state, country, case_count
			FROM   surveillance_condition_counts
			WHERE  period_type  = 'weekly'
			  AND  period_start = $2
		)
		SELECT
			cw.condition_name,
			cw.state,
			cw.country,
			cw.case_count,
			h.rolling_avg,
			COALESCE(h.rolling_stddev, 0) AS rolling_stddev
		FROM current_week cw
		JOIN historical h USING (condition_name, state, country)
		WHERE cw.case_count > h.rolling_avg + 2 * COALESCE(h.rolling_stddev, 1)
		  AND cw.case_count >= $3
	`

	rows, err := r.db.Query(q, windowStart, weekStart, kAnonThreshold)
	if err != nil {
		return nil, fmt.Errorf("surveillance: anomaly candidates: %w", err)
	}
	defer rows.Close()

	var out []AnomalyCandidate
	for rows.Next() {
		var c AnomalyCandidate
		c.PeriodStart = weekStart
		if err := rows.Scan(
			&c.ConditionName, &c.State, &c.Country,
			&c.CurrentCount, &c.RollingAvg, &c.RollingStddev,
		); err != nil {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpsertAnomaly inserts or updates a detected anomaly record.
// Returns true if this is a newly detected anomaly (not previously recorded).
func (r *Repository) UpsertAnomaly(c AnomalyCandidate) (isNew bool, err error) {
	zScore := 0.0
	if c.RollingStddev > 0 {
		zScore = (float64(c.CurrentCount) - c.RollingAvg) / c.RollingStddev
	} else if c.RollingAvg > 0 {
		zScore = float64(c.CurrentCount) / c.RollingAvg
	}
	zScore = math.Round(zScore*100) / 100

	severity := "mild"
	if zScore >= 4.0 {
		severity = "severe"
	} else if zScore >= 3.0 {
		severity = "moderate"
	}

	var existing string
	_ = r.db.QueryRow(`
		SELECT id FROM surveillance_anomalies
		WHERE condition_name = $1 AND state = $2 AND period_start = $3
	`, c.ConditionName, c.State, c.PeriodStart).Scan(&existing)

	if existing == "" {
		// New anomaly
		_, err = r.db.Exec(`
			INSERT INTO surveillance_anomalies
				(condition_name, state, country, period_start,
				 current_count, rolling_avg, rolling_stddev, z_score,
				 severity, is_active, notified, detected_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,FALSE,NOW())
		`, c.ConditionName, c.State, c.Country, c.PeriodStart,
			c.CurrentCount, c.RollingAvg, c.RollingStddev, zScore, severity)
		return true, err
	}

	// Update existing
	_, err = r.db.Exec(`
		UPDATE surveillance_anomalies
		SET current_count  = $1,
		    rolling_avg    = $2,
		    rolling_stddev = $3,
		    z_score        = $4,
		    severity       = $5,
		    is_active      = TRUE,
		    resolved_at    = NULL
		WHERE condition_name = $6 AND state = $7 AND period_start = $8
	`, c.CurrentCount, c.RollingAvg, c.RollingStddev, zScore, severity,
		c.ConditionName, c.State, c.PeriodStart)
	return false, err
}

// MarkUnnotified returns all active anomalies that have not yet had a
// NATS event published, and marks them as notified in the same call.
func (r *Repository) MarkUnnotified() ([]Anomaly, error) {
	rows, err := r.db.Query(`
		UPDATE surveillance_anomalies
		SET notified = TRUE
		WHERE is_active = TRUE AND notified = FALSE
		RETURNING id, condition_name, state, country, period_start,
		          current_count, rolling_avg, rolling_stddev, z_score,
		          severity, is_active, detected_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Anomaly
	for rows.Next() {
		var a Anomaly
		if err := rows.Scan(
			&a.ID, &a.ConditionName, &a.State, &a.Country, &a.PeriodStart,
			&a.CurrentCount, &a.RollingAvg, &a.RollingStddev, &a.ZScore,
			&a.Severity, &a.IsActive, &a.DetectedAt,
		); err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ── Public read queries ───────────────────────────────────────────────────────

// GetSummary returns headline stats for the public dashboard summary card.
func (r *Repository) GetSummary() (*SummaryStats, error) {
	weekStart := isoWeekStart(time.Now().UTC())
	month := time.Now().UTC().AddDate(0, 0, -30)

	s := &SummaryStats{LastUpdated: time.Now().UTC()}

	r.db.QueryRow(`
		SELECT COUNT(DISTINCT condition_name)
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly'
	`).Scan(&s.TotalConditionsTracked)

	r.db.QueryRow(`
		SELECT COALESCE(SUM(case_count), 0)
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly' AND period_start = $1
	`, weekStart).Scan(&s.TotalCasesThisWeek)

	r.db.QueryRow(`
		SELECT COALESCE(SUM(case_count), 0)
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly' AND period_start >= $1
	`, month).Scan(&s.TotalCasesLast30Days)

	r.db.QueryRow(`
		SELECT COUNT(*) FROM surveillance_anomalies WHERE is_active = TRUE
	`).Scan(&s.ActiveAnomalies)

	r.db.QueryRow(`
		SELECT COUNT(DISTINCT state)
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly' AND period_start = $1
	`, weekStart).Scan(&s.StatesWithSignal)

	var lastComputed sql.NullTime
	r.db.QueryRow(`
		SELECT MAX(computed_at) FROM surveillance_condition_counts
	`).Scan(&lastComputed)
	if lastComputed.Valid {
		s.LastUpdated = lastComputed.Time
	}

	return s, nil
}

// GetTopConditions returns the top N conditions by case count over the last
// weeksBack weeks, with per-week trend points.
func (r *Repository) GetTopConditions(weeksBack, limit int) ([]ConditionTrend, error) {
	since := isoWeekStart(time.Now().UTC()).AddDate(0, 0, -7*(weeksBack-1))

	// Step 1: get top N conditions by total volume.
	topRows, err := r.db.Query(`
		SELECT condition_name, SUM(case_count) AS total
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly' AND period_start >= $1
		GROUP BY condition_name
		ORDER BY total DESC
		LIMIT $2
	`, since, limit)
	if err != nil {
		return nil, fmt.Errorf("surveillance: top conditions: %w", err)
	}
	defer topRows.Close()

	type condTotal struct {
		name  string
		total int
	}
	var tops []condTotal
	for topRows.Next() {
		var ct condTotal
		if err := topRows.Scan(&ct.name, &ct.total); err == nil {
			tops = append(tops, ct)
		}
	}
	if len(tops) == 0 {
		return []ConditionTrend{}, nil
	}

	// Build name list for IN clause.
	names := make([]string, len(tops))
	args := []interface{}{since}
	placeholders := make([]string, len(tops))
	for i, ct := range tops {
		names[i] = ct.name
		args = append(args, ct.name)
		placeholders[i] = fmt.Sprintf("$%d", i+2)
	}

	// Step 2: weekly trend points for those conditions.
	trendQuery := fmt.Sprintf(`
		SELECT condition_name, period_start, SUM(case_count) AS cnt
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly'
		  AND period_start >= $1
		  AND condition_name IN (%s)
		GROUP BY condition_name, period_start
		ORDER BY condition_name, period_start
	`, strings.Join(placeholders, ","))

	trendRows, err := r.db.Query(trendQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("surveillance: trend points: %w", err)
	}
	defer trendRows.Close()

	pointsMap := make(map[string][]TrendPoint)
	for trendRows.Next() {
		var cond string
		var ps time.Time
		var cnt int
		if err := trendRows.Scan(&cond, &ps, &cnt); err == nil {
			pointsMap[cond] = append(pointsMap[cond], TrendPoint{
				PeriodStart: ps.Format("2006-01-02"),
				CaseCount:   cnt,
			})
		}
	}

	out := make([]ConditionTrend, 0, len(tops))
	for _, ct := range tops {
		out = append(out, ConditionTrend{
			ConditionName: ct.name,
			TotalCases:    ct.total,
			Points:        pointsMap[ct.name],
		})
	}
	return out, nil
}

// GetByState returns per-state case counts for each top condition,
// suitable for the regional heatmap.
func (r *Repository) GetByState(weeksBack int) ([]ConditionStateRow, error) {
	since := isoWeekStart(time.Now().UTC()).AddDate(0, 0, -7*(weeksBack-1))

	rows, err := r.db.Query(`
		SELECT condition_name, state, SUM(case_count) AS cnt
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly'
		  AND period_start >= $1
		  AND state <> 'Unknown'
		GROUP BY condition_name, state
		ORDER BY condition_name, cnt DESC
	`, since)
	if err != nil {
		return nil, fmt.Errorf("surveillance: by-state: %w", err)
	}
	defer rows.Close()

	condMap := make(map[string]*ConditionStateRow)
	var order []string
	for rows.Next() {
		var cond, state string
		var cnt int
		if err := rows.Scan(&cond, &state, &cnt); err != nil {
			continue
		}
		if _, ok := condMap[cond]; !ok {
			condMap[cond] = &ConditionStateRow{ConditionName: cond}
			order = append(order, cond)
		}
		condMap[cond].TotalCases += cnt
		condMap[cond].States = append(condMap[cond].States, StateBreakdown{
			State: state, CaseCount: cnt,
		})
	}

	out := make([]ConditionStateRow, 0, len(order))
	for _, name := range order {
		out = append(out, *condMap[name])
	}
	return out, rows.Err()
}

// ─── Seasonal patterns ────────────────────────────────────────────────────────

// SeasonalPoint is one calendar-month bucket in a seasonal series.
type SeasonalPoint struct {
	MonthLabel string `json:"monthLabel"` // e.g. "Jan 2025"
	MonthStart string `json:"monthStart"` // "YYYY-MM-01"
	Cases      int    `json:"cases"`
}

// SeasonalCondition is the monthly series for a single condition.
type SeasonalCondition struct {
	ConditionName string          `json:"conditionName"`
	TotalCases    int             `json:"totalCases"`
	Points        []SeasonalPoint `json:"points"`
}

// SeasonalResponse is the full payload returned by the seasonal endpoint.
type SeasonalResponse struct {
	Conditions []SeasonalCondition `json:"conditions"`
	Months     []string            `json:"months"` // ordered month labels
}

// GetSeasonalPatterns returns monthly condition totals over the past weeksBack
// weeks.  Only the top topN conditions by total volume are included.
// Month order is ascending (oldest first).
func (r *Repository) GetSeasonalPatterns(weeksBack, topN int) (*SeasonalResponse, error) {
	since := isoWeekStart(time.Now().UTC()).AddDate(0, 0, -7*(weeksBack-1))

	// Determine top N conditions by total volume over the window.
	topRows, err := r.db.Query(`
		SELECT condition_name, SUM(case_count) AS total
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly' AND period_start >= $1
		GROUP BY condition_name
		ORDER BY total DESC
		LIMIT $2
	`, since, topN)
	if err != nil {
		return nil, fmt.Errorf("surveillance: seasonal top: %w", err)
	}
	defer topRows.Close()

	type ct struct {
		name  string
		total int
	}
	var tops []ct
	for topRows.Next() {
		var c ct
		if err := topRows.Scan(&c.name, &c.total); err == nil {
			tops = append(tops, c)
		}
	}
	topRows.Close()
	if len(tops) == 0 {
		return &SeasonalResponse{Conditions: []SeasonalCondition{}, Months: []string{}}, nil
	}

	// Build IN-clause for the selected condition names.
	args := []interface{}{since}
	phs := make([]string, len(tops))
	for i, c := range tops {
		args = append(args, c.name)
		phs[i] = fmt.Sprintf("$%d", i+2)
	}

	// Monthly aggregation.
	q := fmt.Sprintf(`
		SELECT
			condition_name,
			TO_CHAR(DATE_TRUNC('month', period_start), 'Mon YYYY') AS month_label,
			DATE_TRUNC('month', period_start)::date                AS month_start,
			SUM(case_count)                                        AS cnt
		FROM surveillance_condition_counts
		WHERE period_type = 'weekly'
		  AND period_start >= $1
		  AND condition_name IN (%s)
		GROUP BY condition_name, DATE_TRUNC('month', period_start)
		HAVING SUM(case_count) >= %d
		ORDER BY DATE_TRUNC('month', period_start), condition_name
	`, strings.Join(phs, ","), kAnonThreshold)

	rows, err := r.db.Query(q, args...)
	if err != nil {
		return nil, fmt.Errorf("surveillance: seasonal months: %w", err)
	}
	defer rows.Close()

	type monthKey struct {
		label string
		start string
	}
	type cell struct{ label, start string; cases int }
	cellMap := make(map[string][]cell) // conditionName → []cell
	var monthOrder []monthKey
	monthSeen := make(map[string]bool)

	for rows.Next() {
		var cond, label, start string
		var cnt int
		if err := rows.Scan(&cond, &label, &start, &cnt); err != nil {
			continue
		}
		cellMap[cond] = append(cellMap[cond], cell{label, start, cnt})
		if !monthSeen[label] {
			monthSeen[label] = true
			monthOrder = append(monthOrder, monthKey{label, start})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	months := make([]string, len(monthOrder))
	for i, mk := range monthOrder {
		months[i] = mk.label
	}

	conditions := make([]SeasonalCondition, 0, len(tops))
	for _, t := range tops {
		pts := make([]SeasonalPoint, 0, len(monthOrder))
		lookup := make(map[string]int)
		for _, c := range cellMap[t.name] {
			lookup[c.label] = c.cases
		}
		for _, mk := range monthOrder {
			pts = append(pts, SeasonalPoint{
				MonthLabel: mk.label,
				MonthStart: mk.start,
				Cases:      lookup[mk.label],
			})
		}
		conditions = append(conditions, SeasonalCondition{
			ConditionName: t.name,
			TotalCases:    t.total,
			Points:        pts,
		})
	}

	return &SeasonalResponse{Conditions: conditions, Months: months}, nil
}

// GetActiveAnomalies returns all currently active anomaly signals.
func (r *Repository) GetActiveAnomalies() ([]Anomaly, error) {
	rows, err := r.db.Query(`
		SELECT id, condition_name, state, country, period_start,
		       current_count, rolling_avg, rolling_stddev, z_score,
		       severity, is_active, detected_at
		FROM surveillance_anomalies
		WHERE is_active = TRUE
		ORDER BY z_score DESC, detected_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("surveillance: active anomalies: %w", err)
	}
	defer rows.Close()

	var out []Anomaly
	for rows.Next() {
		var a Anomaly
		if err := rows.Scan(
			&a.ID, &a.ConditionName, &a.State, &a.Country, &a.PeriodStart,
			&a.CurrentCount, &a.RollingAvg, &a.RollingStddev, &a.ZScore,
			&a.Severity, &a.IsActive, &a.DetectedAt,
		); err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
