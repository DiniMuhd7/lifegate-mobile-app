// Package disparities publishes two aggregate endpoints that quantify
// health inequality at Nigerian state level:
//
//  1. Symptom-burden disparities — per-state urgency severity index,
//     escalation rate, prescription coverage, AI confidence, and
//     repeat-patient rate as socioeconomic proxies for health equity.
//
//  2. Physician response-time inequality — median/p75/p90 assignment
//     latency, severe-delay rate, and an inequality ratio comparing
//     each state to the national median.
//
// k-anonymity: all state rows require at least 3 cases.
// No patient or physician identifiers are surfaced.
package disparities

import (
	"database/sql"
	"fmt"
)

const kAnon = 3

// Repository runs all disparity queries.
type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ─── Symptom Burden Disparities ───────────────────────────────────────────────

// StateSymptomBurden holds socioeconomic-proxy health metrics for one state.
type StateSymptomBurden struct {
	State                string  `json:"state"`
	TotalCases           int     `json:"totalCases"`
	UniquePatients       int     `json:"uniquePatients"`
	UrgencySeverityIndex float64 `json:"urgencySeverityIndex"` // 0–1 weighted; 1 = all CRITICAL
	HighCriticalPct      float64 `json:"highCriticalPct"`      // % HIGH or CRITICAL
	EscalationRate       float64 `json:"escalationRate"`       // % escalated to physician
	PrescriptionCoverage float64 `json:"prescriptionCoverage"` // % cases with prescription
	AvgAIConfidence      float64 `json:"avgAIConfidence"`      // mean EDIS confidence score
	RepeatPatientRate    float64 `json:"repeatPatientRate"`    // % patients with > 1 case
	TopCondition         string  `json:"topCondition"`         // most frequent condition
	DisparityRank        int     `json:"disparityRank"`        // 1 = highest urgency burden
}

// SymptomBurdenDisparities is the full payload for the symptom-burden endpoint.
type SymptomBurdenDisparities struct {
	WeeksBack             int                  `json:"weeksBack"`
	TotalStates           int                  `json:"totalStates"`
	HighBurdenStates      int                  `json:"highBurdenStates"` // top-quartile severity
	NationalHighCritPct   float64              `json:"nationalHighCriticalPct"`
	NationalEscalationPct float64              `json:"nationalEscalationPct"`
	ByState               []StateSymptomBurden `json:"byState"`
}

// GetSymptomBurden returns per-state symptom burden with socioeconomic proxies,
// ordered by UrgencySeverityIndex descending (highest burden first).
func (r *Repository) GetSymptomBurden(weeksBack int) (*SymptomBurdenDisparities, error) {
	out := &SymptomBurdenDisparities{WeeksBack: weeksBack}

	rows, err := r.db.Query(fmt.Sprintf(`
		WITH per_patient AS (
		    SELECT user_id, COUNT(*) AS consult_count
		    FROM   diagnoses
		    WHERE  created_at >= NOW() - INTERVAL '%d weeks'
		    GROUP  BY user_id
		),
		state_agg AS (
		    SELECT
		        COALESCE(u.state, 'Unknown')                                           AS state,
		        COUNT(*)                                                               AS total_cases,
		        COUNT(DISTINCT d.user_id)                                              AS unique_patients,
		        COUNT(DISTINCT d.user_id) FILTER (WHERE pp.consult_count > 1)         AS repeat_patients,
		        ROUND(AVG(
		            CASE d.urgency
		                WHEN 'LOW'      THEN 0.25
		                WHEN 'MEDIUM'   THEN 0.50
		                WHEN 'HIGH'     THEN 0.75
		                WHEN 'CRITICAL' THEN 1.0
		            END
		        )::NUMERIC, 3)                                                         AS urgency_severity_index,
		        COUNT(*) FILTER (WHERE d.urgency IN ('HIGH', 'CRITICAL'))              AS high_crit_count,
		        COUNT(*) FILTER (WHERE d.escalated = TRUE)                             AS escalated_count,
		        COUNT(*) FILTER (WHERE d.has_prescription = TRUE)                      AS prescribed_count,
		        ROUND(AVG(
		            CASE WHEN d.ai_response->'diagnosis'->>'confidence' ~ '^\d+$'
		                 THEN (d.ai_response->'diagnosis'->>'confidence')::NUMERIC
		            END
		        )::NUMERIC, 1)                                                         AS avg_ai_confidence
		    FROM   diagnoses d
		    JOIN   users u  ON u.id = d.user_id
		    LEFT   JOIN per_patient pp ON pp.user_id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
		    GROUP  BY COALESCE(u.state, 'Unknown')
		    HAVING COUNT(*) >= %d
		),
		top_cond AS (
		    SELECT DISTINCT ON (COALESCE(u2.state, 'Unknown'))
		        COALESCE(u2.state, 'Unknown')  AS state,
		        d2.condition                   AS top_condition,
		        COUNT(*)                       AS cond_count
		    FROM   diagnoses d2
		    JOIN   users u2 ON u2.id = d2.user_id
		    WHERE  d2.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d2.condition IS NOT NULL AND d2.condition <> ''
		      AND  u2.state IS NOT NULL AND u2.state <> '' AND u2.state <> 'Unknown'
		    GROUP  BY COALESCE(u2.state, 'Unknown'), d2.condition
		    ORDER  BY COALESCE(u2.state, 'Unknown'), COUNT(*) DESC
		)
		SELECT
		    sa.state,
		    sa.total_cases,
		    sa.unique_patients,
		    COALESCE(sa.urgency_severity_index, 0)                                             AS urgency_severity_index,
		    ROUND(100.0 * sa.high_crit_count / NULLIF(sa.total_cases, 0), 2)                  AS high_crit_pct,
		    ROUND(100.0 * sa.escalated_count  / NULLIF(sa.total_cases, 0), 2)                 AS escalation_rate,
		    ROUND(100.0 * sa.prescribed_count / NULLIF(sa.total_cases, 0), 2)                 AS prescription_coverage,
		    COALESCE(sa.avg_ai_confidence, 0)                                                  AS avg_ai_confidence,
		    ROUND(100.0 * sa.repeat_patients / NULLIF(sa.unique_patients, 0), 2)              AS repeat_patient_rate,
		    COALESCE(tc.top_condition, '')                                                     AS top_condition
		FROM   state_agg sa
		LEFT   JOIN top_cond tc ON tc.state = sa.state
		ORDER  BY urgency_severity_index DESC NULLS LAST,
		          total_cases DESC
	`, weeksBack, weeksBack, kAnon, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("symptom burden: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var s StateSymptomBurden
		var usi, hcPct, escRate, rxCov, avgConf, rpRate sql.NullFloat64
		if err := rows.Scan(
			&s.State, &s.TotalCases, &s.UniquePatients,
			&usi, &hcPct, &escRate, &rxCov, &avgConf, &rpRate,
			&s.TopCondition,
		); err != nil {
			return nil, err
		}
		s.UrgencySeverityIndex = round2(usi.Float64)
		s.HighCriticalPct = round2(hcPct.Float64)
		s.EscalationRate = round2(escRate.Float64)
		s.PrescriptionCoverage = round2(rxCov.Float64)
		s.AvgAIConfidence = round2(avgConf.Float64)
		s.RepeatPatientRate = round2(rpRate.Float64)
		out.ByState = append(out.ByState, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Assign disparity ranks and count top-quartile states.
	out.TotalStates = len(out.ByState)
	for i := range out.ByState {
		out.ByState[i].DisparityRank = i + 1
	}
	q75 := out.TotalStates / 4
	if q75 < 1 {
		q75 = 1
	}
	out.HighBurdenStates = q75

	// National headline figures.
	r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    ROUND(100.0 * COUNT(*) FILTER (WHERE urgency IN ('HIGH','CRITICAL')) / NULLIF(COUNT(*), 0), 2),
		    ROUND(100.0 * COUNT(*) FILTER (WHERE escalated = TRUE)              / NULLIF(COUNT(*), 0), 2)
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(&out.NationalHighCritPct, &out.NationalEscalationPct)

	return out, nil
}

// ─── Response-Time Inequality ─────────────────────────────────────────────────

// StateResponseTime holds physician response-time distribution for one state.
type StateResponseTime struct {
	State             string  `json:"state"`
	TotalCases        int     `json:"totalCases"`
	AssignedCases     int     `json:"assignedCases"`
	MedianHours       float64 `json:"medianResponseHours"`
	P75Hours          float64 `json:"p75ResponseHours"`
	P90Hours          float64 `json:"p90ResponseHours"`
	SLABreachPct      float64 `json:"slaBreachPct"`      // > 4 h
	SevereDelayPct    float64 `json:"severeDelayPct"`    // > 12 h
	HighUrgencyAvgHrs float64 `json:"highUrgencyAvgHours"` // avg for HIGH/CRITICAL
	InequalityRatio   float64 `json:"inequalityRatio"`   // state median / national median
}

// ResponseTimeInequality is the full payload for the response-time endpoint.
type ResponseTimeInequality struct {
	WeeksBack           int                 `json:"weeksBack"`
	NationalMedianHours float64             `json:"nationalMedianHours"`
	NationalP90Hours    float64             `json:"nationalP90Hours"`
	WorstStateMedian    float64             `json:"worstStateMedianHours"`
	BestStateMedian     float64             `json:"bestStateMedianHours"`
	InequalityGapHours  float64             `json:"inequalityGapHours"`
	ByState             []StateResponseTime `json:"byState"`
}

// GetResponseTimeInequality returns physician response-time percentile
// distributions by state, ordered by median response time descending.
func (r *Repository) GetResponseTimeInequality(weeksBack int) (*ResponseTimeInequality, error) {
	out := &ResponseTimeInequality{WeeksBack: weeksBack}

	// 1. National median + p90 (base for inequality ratio calculation).
	var natMedian, natP90 sql.NullFloat64
	r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
		        EXTRACT(EPOCH FROM (physician_assigned_at - created_at)) / 3600.0
		    )::NUMERIC, 2),
		    ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY
		        EXTRACT(EPOCH FROM (physician_assigned_at - created_at)) / 3600.0
		    )::NUMERIC, 2)
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - INTERVAL '%d weeks'
		  AND d.physician_assigned_at IS NOT NULL
		  AND d.physician_assigned_at > d.created_at
		  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
	`, weeksBack)).Scan(&natMedian, &natP90)
	if natMedian.Valid {
		out.NationalMedianHours = round2(natMedian.Float64)
	}
	if natP90.Valid {
		out.NationalP90Hours = round2(natP90.Float64)
	}
	nationalMedian := out.NationalMedianHours
	if nationalMedian == 0 {
		nationalMedian = 1 // avoid division by zero
	}

	// 2. Per-state distribution.
	rows, err := r.db.Query(fmt.Sprintf(`
		WITH wait_times AS (
		    SELECT
		        COALESCE(u.state, 'Unknown')                                              AS state,
		        COUNT(*) OVER (PARTITION BY COALESCE(u.state, 'Unknown'))                AS total_cases,
		        EXTRACT(EPOCH FROM (d.physician_assigned_at - d.created_at)) / 3600.0    AS wait_hours,
		        d.urgency                                                                 AS urgency
		    FROM   diagnoses d
		    JOIN   users u ON u.id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d.physician_assigned_at IS NOT NULL
		      AND  d.physician_assigned_at > d.created_at
		      AND  u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
		)
		SELECT
		    state,
		    MAX(total_cases)                                                               AS total_cases,
		    COUNT(*)                                                                       AS assigned_cases,
		    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wait_hours)::NUMERIC, 2)   AS median_hours,
		    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY wait_hours)::NUMERIC, 2)  AS p75_hours,
		    ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY wait_hours)::NUMERIC, 2)   AS p90_hours,
		    ROUND(100.0 * COUNT(*) FILTER (WHERE wait_hours > 4)  / COUNT(*), 2)         AS breach_pct,
		    ROUND(100.0 * COUNT(*) FILTER (WHERE wait_hours > 12) / COUNT(*), 2)         AS severe_delay_pct,
		    ROUND(AVG(wait_hours) FILTER (WHERE urgency IN ('HIGH','CRITICAL'))::NUMERIC, 2) AS high_urg_avg
		FROM   wait_times
		GROUP  BY state
		HAVING COUNT(*) >= %d
		ORDER  BY median_hours DESC NULLS LAST
	`, weeksBack, kAnon))
	if err != nil {
		return nil, fmt.Errorf("response time inequality: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var s StateResponseTime
		var med, p75, p90, breach, severe, huAvg sql.NullFloat64
		if err := rows.Scan(
			&s.State, &s.TotalCases, &s.AssignedCases,
			&med, &p75, &p90, &breach, &severe, &huAvg,
		); err != nil {
			return nil, err
		}
		s.MedianHours = round2(med.Float64)
		s.P75Hours = round2(p75.Float64)
		s.P90Hours = round2(p90.Float64)
		s.SLABreachPct = round2(breach.Float64)
		s.SevereDelayPct = round2(severe.Float64)
		if huAvg.Valid {
			s.HighUrgencyAvgHrs = round2(huAvg.Float64)
		}
		s.InequalityRatio = round2(s.MedianHours / nationalMedian)
		out.ByState = append(out.ByState, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Compute best/worst/gap from sorted results.
	if len(out.ByState) > 0 {
		out.WorstStateMedian = out.ByState[0].MedianHours
		out.BestStateMedian = out.ByState[len(out.ByState)-1].MedianHours
		out.InequalityGapHours = round2(out.WorstStateMedian - out.BestStateMedian)
	}

	return out, nil
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
