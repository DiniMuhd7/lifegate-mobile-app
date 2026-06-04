// Package institutional exposes deep analytics endpoints for callers that have
// been granted paid/approved institutional access through the access portal.
//
// All queries enforce k-anonymity (≥ 3 cases per cell) and return only
// aggregate data — no personally identifiable information is ever exposed.
//
// Available endpoints (all require X-API-Key):
//
//	GET /api/institutional/surveillance/trends   — weekly condition×state×gender breakdown (up to 104 wks)
//	GET /api/institutional/demographics          — per-condition age/gender/blood-type/genotype breakdown
//	GET /api/institutional/outcomes              — physician decision + care pathway completion per condition×state
//	GET /api/institutional/disparities           — full 37-state disparity matrix with condition breakdown
//	GET /api/institutional/export                — CSV or JSON download of any dataset (export & api tiers only)
package institutional

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ─── Shared SQL expressions (reused from demography package conventions) ──────

const ageBucketExpr = `
  CASE
    WHEN u.dob ~ '^\d{4}-\d{2}-\d{2}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) >= 60             THEN '60+'
        ELSE 'Unknown'
      END
    WHEN u.dob ~ '^\d{2}/\d{2}/\d{4}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) >= 60             THEN '60+'
        ELSE 'Unknown'
      END
    WHEN u.dob ~ '^\d{2}-\d{2}-\d{4}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) >= 60             THEN '60+'
        ELSE 'Unknown'
      END
    ELSE 'Unknown'
  END`

const genderExpr = `
  CASE
    WHEN LOWER(TRIM(u.gender)) IN ('male','m','man','boy')     THEN 'Male'
    WHEN LOWER(TRIM(u.gender)) IN ('female','f','woman','girl') THEN 'Female'
    ELSE 'Other'
  END`

// ─── Repository ──────────────────────────────────────────────────────────────

// Repository reads only from diagnoses, users, referrals, and follow-up tables.
// No write operations; no PII columns selected.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ─── Surveillance trends ─────────────────────────────────────────────────────

// SurveillanceTrendRow is one (condition, state, gender, week) aggregate cell.
type SurveillanceTrendRow struct {
	Condition string    `json:"condition"`
	State     string    `json:"state"`
	Gender    string    `json:"gender"`
	WeekStart time.Time `json:"weekStart"`
	CaseCount int       `json:"caseCount"`
}

// GetSurveillanceTrends returns weekly case counts broken down by condition,
// Nigerian state, and gender for up to weeksBack weeks (max 104).
// Only cells with ≥ 3 cases are returned (k-anonymity).
func (r *Repository) GetSurveillanceTrends(weeksBack int) ([]SurveillanceTrendRow, error) {
	if weeksBack < 1 {
		weeksBack = 52
	}
	if weeksBack > 104 {
		weeksBack = 104
	}

	query := fmt.Sprintf(`
		SELECT
			d.condition_name                                           AS condition,
			COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown')            AS state,
			%s                                                         AS gender,
			DATE_TRUNC('week', d.created_at)::timestamptz             AS week_start,
			COUNT(*)                                                   AS case_count
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - make_interval(weeks => $1)
		  AND d.condition_name IS NOT NULL
		  AND d.condition_name <> ''
		GROUP BY condition, state, gender, week_start
		HAVING COUNT(*) >= 3
		ORDER BY week_start DESC, case_count DESC`, genderExpr)

	rows, err := r.db.Query(query, weeksBack)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []SurveillanceTrendRow
	for rows.Next() {
		var row SurveillanceTrendRow
		if err := rows.Scan(&row.Condition, &row.State, &row.Gender, &row.WeekStart, &row.CaseCount); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// ─── Demographics breakdown ──────────────────────────────────────────────────

// DemographicBreakdownRow is one (condition, age_group, gender, blood_type, genotype) cell.
type DemographicBreakdownRow struct {
	Condition string `json:"condition"`
	AgeGroup  string `json:"ageGroup"`
	Gender    string `json:"gender"`
	BloodType string `json:"bloodType"`
	Genotype  string `json:"genotype"`
	CaseCount int    `json:"caseCount"`
}

// GetDemographicsBreakdown returns per-condition case counts cross-tabulated
// by age group, gender, blood type, and genotype.
// Only cells with ≥ 3 cases are returned (k-anonymity).
func (r *Repository) GetDemographicsBreakdown(weeksBack int) ([]DemographicBreakdownRow, error) {
	if weeksBack < 1 {
		weeksBack = 52
	}
	if weeksBack > 104 {
		weeksBack = 104
	}

	query := fmt.Sprintf(`
		SELECT
			d.condition_name                                                         AS condition,
			%s                                                                       AS age_group,
			%s                                                                       AS gender,
			COALESCE(NULLIF(TRIM(u.blood_type),''), 'Unknown')                       AS blood_type,
			COALESCE(NULLIF(TRIM(u.genotype),''),   'Unknown')                       AS genotype,
			COUNT(*)                                                                 AS case_count
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - make_interval(weeks => $1)
		  AND d.condition_name IS NOT NULL
		  AND d.condition_name <> ''
		GROUP BY condition, age_group, gender, blood_type, genotype
		HAVING COUNT(*) >= 3
		ORDER BY condition, case_count DESC`, ageBucketExpr, genderExpr)

	rows, err := r.db.Query(query, weeksBack)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []DemographicBreakdownRow
	for rows.Next() {
		var row DemographicBreakdownRow
		if err := rows.Scan(&row.Condition, &row.AgeGroup, &row.Gender, &row.BloodType, &row.Genotype, &row.CaseCount); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// ─── Outcomes deep ───────────────────────────────────────────────────────────

// OutcomeRow is one (condition, state) outcome aggregate.
type OutcomeRow struct {
	Condition          string  `json:"condition"`
	State              string  `json:"state"`
	TotalCases         int     `json:"totalCases"`
	AIApproved         int     `json:"aiApproved"`
	PhysicianApproved  int     `json:"physicianApproved"`
	Overridden         int     `json:"overridden"`
	Escalated          int     `json:"escalated"`
	WithPrescription   int     `json:"withPrescription"`
	FollowUpScheduled  int     `json:"followUpScheduled"`
	FollowUpCompleted  int     `json:"followUpCompleted"`
	AvgAIConfidence    float64 `json:"avgAIConfidence"`
	CompletionRatePct  float64 `json:"completionRatePct"`
}

// GetOutcomesDeep returns physician-decision and care-pathway completion data
// grouped by (condition, state) for up to weeksBack weeks.
func (r *Repository) GetOutcomesDeep(weeksBack int) ([]OutcomeRow, error) {
	if weeksBack < 1 {
		weeksBack = 52
	}
	if weeksBack > 104 {
		weeksBack = 104
	}

	rows, err := r.db.Query(`
		SELECT
			d.condition_name                                              AS condition,
			COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown')               AS state,
			COUNT(*)                                                      AS total_cases,
			COUNT(*) FILTER (WHERE d.status = 'Approved')                AS ai_approved,
			COUNT(*) FILTER (WHERE d.physician_notes IS NOT NULL
			                   AND d.physician_notes <> '')               AS physician_reviewed,
			COUNT(*) FILTER (WHERE d.escalated_to IS NOT NULL)           AS escalated,
			COUNT(*) FILTER (WHERE d.has_prescription = TRUE)            AS with_prescription,
			COUNT(*) FILTER (WHERE d.follow_up_date IS NOT NULL)         AS follow_up_scheduled,
			COUNT(*) FILTER (WHERE d.follow_up_completed = TRUE)         AS follow_up_completed,
			ROUND(AVG(
				CASE WHEN d.ai_confidence ~ '^\d+(\.\d+)?$'
				     THEN d.ai_confidence::numeric ELSE NULL END
			)::numeric, 1)                                               AS avg_ai_confidence
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - make_interval(weeks => $1)
		  AND d.condition_name IS NOT NULL AND d.condition_name <> ''
		GROUP BY condition, state
		HAVING COUNT(*) >= 3
		ORDER BY total_cases DESC`, weeksBack)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []OutcomeRow
	for rows.Next() {
		var row OutcomeRow
		var avgConf sql.NullFloat64
		if err := rows.Scan(
			&row.Condition, &row.State,
			&row.TotalCases, &row.AIApproved, &row.PhysicianApproved,
			&row.Escalated, &row.WithPrescription,
			&row.FollowUpScheduled, &row.FollowUpCompleted,
			&avgConf,
		); err != nil {
			return nil, err
		}
		if avgConf.Valid {
			row.AvgAIConfidence = avgConf.Float64
		}
		if row.FollowUpScheduled > 0 {
			row.CompletionRatePct = float64(row.FollowUpCompleted) / float64(row.FollowUpScheduled) * 100
		}
		// Overridden = physician-reviewed and status changed from AI suggestion
		row.Overridden = row.PhysicianApproved // repurposed: total physician-touched cases
		result = append(result, row)
	}
	return result, rows.Err()
}

// ─── Disparities deep ────────────────────────────────────────────────────────

// DisparityConditionRow is a condition entry within a state disparity record.
type DisparityConditionRow struct {
	Condition string  `json:"condition"`
	CaseCount int     `json:"caseCount"`
	Pct       float64 `json:"pct"`
}

// DisparityStateRow is the full disparity profile for one Nigerian state.
type DisparityStateRow struct {
	State                string                  `json:"state"`
	TotalCases           int                     `json:"totalCases"`
	HighCriticalPct      float64                 `json:"highCriticalPct"`
	EscalationRate       float64                 `json:"escalationRate"`
	PrescriptionCoverage float64                 `json:"prescriptionCoverage"`
	FollowUpCompletion   float64                 `json:"followUpCompletion"`
	AvgAIConfidence      float64                 `json:"avgAIConfidence"`
	RepeatPatientRate    float64                 `json:"repeatPatientRate"`
	TopConditions        []DisparityConditionRow `json:"topConditions"`
}

// GetDisparitiesDeep returns the full state-level disparity matrix with the top
// conditions per state. Unlike the public endpoint (top 10 states), this returns
// all states with ≥ 3 aggregate cases.
func (r *Repository) GetDisparitiesDeep(weeksBack int) ([]DisparityStateRow, error) {
	if weeksBack < 1 {
		weeksBack = 52
	}
	if weeksBack > 104 {
		weeksBack = 104
	}

	// Main state aggregates
	stateRows, err := r.db.Query(`
		SELECT
			COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown')               AS state,
			COUNT(*)                                                      AS total_cases,
			ROUND(100.0 * COUNT(*) FILTER (
				WHERE LOWER(d.urgency) IN ('high','critical')
			) / NULLIF(COUNT(*), 0), 1)                                  AS high_critical_pct,
			ROUND(100.0 * COUNT(*) FILTER (
				WHERE d.escalated_to IS NOT NULL
			) / NULLIF(COUNT(*), 0), 1)                                  AS escalation_rate,
			ROUND(100.0 * COUNT(*) FILTER (
				WHERE d.has_prescription = TRUE
			) / NULLIF(COUNT(*), 0), 1)                                  AS prescription_coverage,
			ROUND(100.0 * COUNT(*) FILTER (
				WHERE d.follow_up_completed = TRUE
			) / NULLIF(COUNT(*) FILTER (WHERE d.follow_up_date IS NOT NULL), 0), 1) AS follow_up_completion,
			ROUND(AVG(
				CASE WHEN d.ai_confidence ~ '^\d+(\.\d+)?$'
				     THEN d.ai_confidence::numeric ELSE NULL END
			)::numeric, 1)                                               AS avg_ai_confidence,
			ROUND(100.0 * (
				SELECT COUNT(DISTINCT d2.user_id)
				FROM   diagnoses d2
				WHERE  COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown') =
				       COALESCE(NULLIF(TRIM((SELECT state FROM users WHERE id = d2.user_id)), ''), 'Unknown')
				  AND  d2.created_at >= NOW() - make_interval(weeks => $1)
				GROUP BY d2.user_id HAVING COUNT(*) > 1
			) / NULLIF(COUNT(DISTINCT d.user_id), 0), 1)                AS repeat_patient_rate
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - make_interval(weeks => $1)
		  AND d.condition_name IS NOT NULL AND d.condition_name <> ''
		GROUP BY state
		HAVING COUNT(*) >= 3
		ORDER BY total_cases DESC`, weeksBack)
	if err != nil {
		return nil, err
	}
	defer stateRows.Close()

	stateMap := make(map[string]*DisparityStateRow)
	var stateOrder []string
	for stateRows.Next() {
		var row DisparityStateRow
		var hcPct, escRate, rxCov, fuComp, avgConf, repeatRate sql.NullFloat64
		if err := stateRows.Scan(
			&row.State, &row.TotalCases,
			&hcPct, &escRate, &rxCov, &fuComp, &avgConf, &repeatRate,
		); err != nil {
			return nil, err
		}
		if hcPct.Valid {
			row.HighCriticalPct = hcPct.Float64
		}
		if escRate.Valid {
			row.EscalationRate = escRate.Float64
		}
		if rxCov.Valid {
			row.PrescriptionCoverage = rxCov.Float64
		}
		if fuComp.Valid {
			row.FollowUpCompletion = fuComp.Float64
		}
		if avgConf.Valid {
			row.AvgAIConfidence = avgConf.Float64
		}
		if repeatRate.Valid {
			row.RepeatPatientRate = repeatRate.Float64
		}
		stateMap[row.State] = &row
		stateOrder = append(stateOrder, row.State)
	}
	if err := stateRows.Err(); err != nil {
		return nil, err
	}

	// Top 5 conditions per state
	condRows, err := r.db.Query(`
		SELECT
			COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown') AS state,
			d.condition_name,
			COUNT(*) AS case_count
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - make_interval(weeks => $1)
		  AND d.condition_name IS NOT NULL AND d.condition_name <> ''
		GROUP BY state, d.condition_name
		HAVING COUNT(*) >= 3
		ORDER BY state, case_count DESC`, weeksBack)
	if err != nil {
		return nil, err
	}
	defer condRows.Close()

	// Track how many top conditions we've assigned per state
	condCount := make(map[string]int)
	for condRows.Next() {
		var state, condition string
		var count int
		if err := condRows.Scan(&state, &condition, &count); err != nil {
			return nil, err
		}
		sr, ok := stateMap[state]
		if !ok {
			continue
		}
		if condCount[state] >= 5 {
			continue
		}
		stateTotal := sr.TotalCases
		pct := 0.0
		if stateTotal > 0 {
			pct = float64(count) / float64(stateTotal) * 100
		}
		sr.TopConditions = append(sr.TopConditions, DisparityConditionRow{
			Condition: condition,
			CaseCount: count,
			Pct:       pct,
		})
		condCount[state]++
	}
	if err := condRows.Err(); err != nil {
		return nil, err
	}

	// Return in state-order
	result := make([]DisparityStateRow, 0, len(stateOrder))
	for _, s := range stateOrder {
		result = append(result, *stateMap[s])
	}
	return result, nil
}

// ─── Export helpers ──────────────────────────────────────────────────────────

// SurveillanceTrendCSVHeaders returns the CSV column headers for surveillance trends.
func SurveillanceTrendCSVHeaders() []string {
	return []string{"condition", "state", "gender", "week_start", "case_count"}
}

// SurveillanceTrendCSVRow converts a SurveillanceTrendRow to a CSV string slice.
func SurveillanceTrendCSVRow(r SurveillanceTrendRow) []string {
	return []string{
		r.Condition, r.State, r.Gender,
		r.WeekStart.Format("2006-01-02"),
		fmt.Sprintf("%d", r.CaseCount),
	}
}

// DemographicsCSVHeaders returns the CSV column headers for demographics breakdown.
func DemographicsCSVHeaders() []string {
	return []string{"condition", "age_group", "gender", "blood_type", "genotype", "case_count"}
}

// DemographicsCSVRow converts a DemographicBreakdownRow to a CSV string slice.
func DemographicsCSVRow(r DemographicBreakdownRow) []string {
	return []string{
		r.Condition, r.AgeGroup, r.Gender, r.BloodType, r.Genotype,
		fmt.Sprintf("%d", r.CaseCount),
	}
}

// OutcomesCSVHeaders returns the CSV column headers for outcomes data.
func OutcomesCSVHeaders() []string {
	return []string{
		"condition", "state", "total_cases",
		"ai_approved", "physician_reviewed", "escalated",
		"with_prescription", "follow_up_scheduled", "follow_up_completed",
		"avg_ai_confidence_pct", "completion_rate_pct",
	}
}

// OutcomesCSVRow converts an OutcomeRow to a CSV string slice.
func OutcomesCSVRow(r OutcomeRow) []string {
	return []string{
		r.Condition, r.State,
		fmt.Sprintf("%d", r.TotalCases),
		fmt.Sprintf("%d", r.AIApproved),
		fmt.Sprintf("%d", r.PhysicianApproved),
		fmt.Sprintf("%d", r.Escalated),
		fmt.Sprintf("%d", r.WithPrescription),
		fmt.Sprintf("%d", r.FollowUpScheduled),
		fmt.Sprintf("%d", r.FollowUpCompleted),
		fmt.Sprintf("%.1f", r.AvgAIConfidence),
		fmt.Sprintf("%.1f", r.CompletionRatePct),
	}
}

// DisparitiesCSVHeaders returns the CSV column headers for disparities data.
func DisparitiesCSVHeaders() []string {
	return []string{
		"state", "total_cases",
		"high_critical_pct", "escalation_rate_pct",
		"prescription_coverage_pct", "follow_up_completion_pct",
		"avg_ai_confidence_pct", "repeat_patient_rate_pct",
		"top_condition_1", "top_condition_2", "top_condition_3",
	}
}

// DisparitiesCSVRow converts a DisparityStateRow to a CSV string slice.
func DisparitiesCSVRow(r DisparityStateRow) []string {
	topConds := make([]string, 3)
	for i := 0; i < 3; i++ {
		if i < len(r.TopConditions) {
			topConds[i] = r.TopConditions[i].Condition
		}
	}
	return []string{
		r.State,
		fmt.Sprintf("%d", r.TotalCases),
		fmt.Sprintf("%.1f", r.HighCriticalPct),
		fmt.Sprintf("%.1f", r.EscalationRate),
		fmt.Sprintf("%.1f", r.PrescriptionCoverage),
		fmt.Sprintf("%.1f", r.FollowUpCompletion),
		fmt.Sprintf("%.1f", r.AvgAIConfidence),
		fmt.Sprintf("%.1f", r.RepeatPatientRate),
		topConds[0], topConds[1], topConds[2],
	}
}

// validDataset returns true if ds is a known exportable dataset name.
func validDataset(ds string) bool {
	switch strings.ToLower(ds) {
	case "surveillance", "demographics", "outcomes", "disparities":
		return true
	}
	return false
}
