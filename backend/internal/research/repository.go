// Package research provides three public endpoints exposing anonymised
// aggregate research-quality analytics:
//
//  1. Longitudinal record summary — physician-adjudicated case counts,
//     repeat-patient rates, and outcome verification coverage.
//  2. AI benchmark — EDIS confidence score distributions vs physician
//     approval/override rates, suitable as a benchmark dataset for AI
//     diagnostic accuracy evaluation in low-resource settings.
//  3. Comorbidity — pairwise condition co-occurrence counts across patients,
//     enabling population-scale comorbidity research.
//
// All queries enforce k-anonymity (minimum 3 patients per cell) and return
// only aggregate statistics — no personally identifiable information.
package research

import (
	"database/sql"
	"fmt"
)

// Repository reads from diagnoses and users tables.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ─── Longitudinal Records ─────────────────────────────────────────────────────

// LongitudinalStats summarises the availability and quality of longitudinal,
// physician-adjudicated health records on the platform.
type LongitudinalStats struct {
	WeeksBack             int     `json:"weeksBack"`
	TotalCases            int     `json:"totalCases"`
	PhysicianAdjudicated  int     `json:"physicianAdjudicated"`
	AdjudicationPct       float64 `json:"adjudicationPct"`
	ApprovedCases         int     `json:"approvedCases"`
	RejectedCases         int     `json:"rejectedCases"`
	ApprovalPct           float64 `json:"approvalPct"`
	OutcomeVerified       int     `json:"outcomeVerified"`
	OutcomeVerifiedPct    float64 `json:"outcomeVerifiedPct"`
	RepeatPatients        int     `json:"repeatPatients"`
	AvgConsultsPerPatient float64 `json:"avgConsultsPerPatient"`
	UniquePatients        int     `json:"uniquePatients"`
}

// GetLongitudinal returns aggregate longitudinal record quality metrics.
func (r *Repository) GetLongitudinal(weeksBack int) (*LongitudinalStats, error) {
	s := &LongitudinalStats{WeeksBack: weeksBack}

	// 1. Case-level totals.
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*)                                                           AS total,
		    COUNT(*) FILTER (WHERE physician_id IS NOT NULL)                   AS adjudicated,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved')            AS approved,
		    COUNT(*) FILTER (WHERE physician_decision = 'Rejected')            AS rejected,
		    COUNT(*) FILTER (WHERE outcome_checked = TRUE)                     AS outcome_verified
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(
		&s.TotalCases, &s.PhysicianAdjudicated,
		&s.ApprovedCases, &s.RejectedCases, &s.OutcomeVerified,
	)
	if err != nil {
		return nil, fmt.Errorf("case totals: %w", err)
	}

	// 2. Patient-level repeat consultation stats.
	err = r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*)                                          AS unique_patients,
		    COUNT(*) FILTER (WHERE consult_count > 1)        AS repeat_patients,
		    ROUND(AVG(consult_count)::numeric, 2)            AS avg_consults
		FROM (
		    SELECT user_id, COUNT(*) AS consult_count
		    FROM   diagnoses
		    WHERE  created_at >= NOW() - INTERVAL '%d weeks'
		    GROUP  BY user_id
		) pc
	`, weeksBack)).Scan(&s.UniquePatients, &s.RepeatPatients, &s.AvgConsultsPerPatient)
	if err != nil {
		return nil, fmt.Errorf("patient stats: %w", err)
	}

	// Derived rates.
	if s.TotalCases > 0 {
		s.AdjudicationPct = round2(float64(s.PhysicianAdjudicated) / float64(s.TotalCases) * 100)
		s.OutcomeVerifiedPct = round2(float64(s.OutcomeVerified) / float64(s.TotalCases) * 100)
	}
	if s.PhysicianAdjudicated > 0 {
		s.ApprovalPct = round2(float64(s.ApprovedCases) / float64(s.PhysicianAdjudicated) * 100)
	}
	return s, nil
}

// ─── AI Benchmark ─────────────────────────────────────────────────────────────

// ConfidenceBand holds AI diagnostic accuracy metrics for one confidence range.
type ConfidenceBand struct {
	Band           string  `json:"band"`           // "0–20", "21–40", …, "81–100"
	TotalCases     int     `json:"totalCases"`
	Reviewed       int     `json:"physicianReviewed"`
	Approved       int     `json:"approved"`
	Rejected       int     `json:"rejected"`
	Modified       int     `json:"modified"` // physician_ai_output IS NOT NULL
	OverrideRatePct float64 `json:"overrideRatePct"`
	ApprovalRatePct float64 `json:"approvalRatePct"`
}

// AIBenchmark is the full payload for the AI benchmark endpoint.
type AIBenchmark struct {
	WeeksBack          int              `json:"weeksBack"`
	TotalWithScore     int              `json:"totalWithConfidenceScore"`
	TotalReviewed      int              `json:"totalReviewed"`
	OverallApprovalPct float64          `json:"overallApprovalPct"`
	OverallOverridePct float64          `json:"overallOverridePct"`
	Bands              []ConfidenceBand `json:"byConfidenceBand"`
}

// bandOrder maps band label to its sort position.
var bandOrder = map[string]int{
	"0–20": 1, "21–40": 2, "41–60": 3, "61–80": 4, "81–100": 5,
}

// GetAIBenchmark returns EDIS confidence distributions vs physician override rates.
func (r *Repository) GetAIBenchmark(weeksBack int) (*AIBenchmark, error) {
	b := &AIBenchmark{WeeksBack: weeksBack}

	rows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    band,
		    COUNT(*)                                                              AS total,
		    COUNT(*) FILTER (WHERE physician_id IS NOT NULL)                     AS reviewed,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved')              AS approved,
		    COUNT(*) FILTER (WHERE physician_decision = 'Rejected')              AS rejected,
		    COUNT(*) FILTER (WHERE physician_ai_output IS NOT NULL)              AS modified
		FROM (
		    SELECT
		        physician_id,
		        physician_decision,
		        physician_ai_output,
		        CASE
		            WHEN (ai_response->'diagnosis'->>'confidence')::int BETWEEN 0   AND 20  THEN '0–20'
		            WHEN (ai_response->'diagnosis'->>'confidence')::int BETWEEN 21  AND 40  THEN '21–40'
		            WHEN (ai_response->'diagnosis'->>'confidence')::int BETWEEN 41  AND 60  THEN '41–60'
		            WHEN (ai_response->'diagnosis'->>'confidence')::int BETWEEN 61  AND 80  THEN '61–80'
		            WHEN (ai_response->'diagnosis'->>'confidence')::int BETWEEN 81  AND 100 THEN '81–100'
		        END AS band
		    FROM diagnoses
		    WHERE created_at                            >= NOW() - INTERVAL '%d weeks'
		      AND ai_response->'diagnosis'->>'confidence' IS NOT NULL
		      AND ai_response->'diagnosis'->>'confidence' ~ '^\d+$'
		) sub
		WHERE band IS NOT NULL
		GROUP BY band
		ORDER BY MIN(CASE band
		    WHEN '0–20'   THEN 1
		    WHEN '21–40'  THEN 2
		    WHEN '41–60'  THEN 3
		    WHEN '61–80'  THEN 4
		    WHEN '81–100' THEN 5
		    END)
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("benchmark query: %w", err)
	}
	defer rows.Close()

	totalReviewed, totalApproved, totalRejected := 0, 0, 0
	for rows.Next() {
		var cb ConfidenceBand
		if err := rows.Scan(
			&cb.Band, &cb.TotalCases, &cb.Reviewed,
			&cb.Approved, &cb.Rejected, &cb.Modified,
		); err != nil {
			return nil, err
		}
		if cb.Reviewed > 0 {
			cb.ApprovalRatePct = round2(float64(cb.Approved) / float64(cb.Reviewed) * 100)
			cb.OverrideRatePct = round2(float64(cb.Rejected) / float64(cb.Reviewed) * 100)
		}
		b.TotalWithScore += cb.TotalCases
		totalReviewed += cb.Reviewed
		totalApproved += cb.Approved
		totalRejected += cb.Rejected
		b.Bands = append(b.Bands, cb)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	b.TotalReviewed = totalReviewed
	if totalReviewed > 0 {
		b.OverallApprovalPct = round2(float64(totalApproved) / float64(totalReviewed) * 100)
		b.OverallOverridePct = round2(float64(totalRejected) / float64(totalReviewed) * 100)
	}
	return b, nil
}

// ─── Comorbidity & Co-occurrence ──────────────────────────────────────────────

// ComorbidityPair is a pair of conditions that co-occur in the same patient's
// case history with a count of distinct patients showing both.
type ComorbidityPair struct {
	ConditionA   string `json:"conditionA"`
	ConditionB   string `json:"conditionB"`
	PatientCount int    `json:"patientCount"`
}

// ComorbidityResponse is the full payload for the comorbidity endpoint.
type ComorbidityResponse struct {
	WeeksBack              int               `json:"weeksBack"`
	TopN                   int               `json:"topN"`
	PatientsWithMultiple   int               `json:"patientsWithMultipleConditions"`
	TotalConditionPairs    int               `json:"totalConditionPairs"`
	TopPairs               []ComorbidityPair `json:"topPairs"`
}

// GetComorbidity returns pairwise condition co-occurrence across patients.
// A pair is included only when ≥ 3 distinct patients show both conditions
// (k-anonymity). topN caps the returned pairs (1-30).
func (r *Repository) GetComorbidity(weeksBack, topN int) (*ComorbidityResponse, error) {
	resp := &ComorbidityResponse{WeeksBack: weeksBack, TopN: topN}

	// 1. Patients with ≥ 2 distinct conditions (longitudinal or concurrent).
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM (
		    SELECT user_id
		    FROM   diagnoses
		    WHERE  created_at >= NOW() - INTERVAL '%d weeks'
		      AND  condition IS NOT NULL AND condition <> ''
		    GROUP  BY user_id
		    HAVING COUNT(DISTINCT condition) >= 2
		) multi
	`, weeksBack)).Scan(&resp.PatientsWithMultiple)
	if err != nil {
		return nil, fmt.Errorf("multi-condition patients: %w", err)
	}

	// 2. Pairwise co-occurrence.
	// Self-join on user_id; use id < id2 to avoid mirror duplicates.
	// LEAST/GREATEST ensures canonical ordering independent of join direction.
	rows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    LEAST(d1.condition, d2.condition)    AS cond_a,
		    GREATEST(d1.condition, d2.condition) AS cond_b,
		    COUNT(DISTINCT d1.user_id)           AS patient_count
		FROM   diagnoses d1
		JOIN   diagnoses d2
		       ON  d2.user_id  = d1.user_id
		       AND d2.id       > d1.id
		       AND d2.condition IS NOT NULL AND d2.condition <> ''
		       AND d2.condition <> d1.condition
		WHERE  d1.condition IS NOT NULL AND d1.condition <> ''
		  AND  d1.created_at >= NOW() - INTERVAL '%d weeks'
		  AND  d2.created_at >= NOW() - INTERVAL '%d weeks'
		GROUP  BY 1, 2
		HAVING COUNT(DISTINCT d1.user_id) >= 3
		ORDER  BY patient_count DESC
		LIMIT  %d
	`, weeksBack, weeksBack, topN))
	if err != nil {
		return nil, fmt.Errorf("comorbidity pairs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p ComorbidityPair
		if err := rows.Scan(&p.ConditionA, &p.ConditionB, &p.PatientCount); err != nil {
			return nil, err
		}
		resp.TopPairs = append(resp.TopPairs, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	resp.TotalConditionPairs = len(resp.TopPairs)
	return resp, nil
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// ─── AI-Physician Agreement & Disagreement Patterns ───────────────────────────

// UrgencyAgreement holds physician agreement/disagreement breakdown for one
// urgency level — revealing whether higher-urgency cases generate more friction
// between AI output and clinical judgement.
type UrgencyAgreement struct {
	Urgency     string  `json:"urgency"`
	Reviewed    int     `json:"reviewed"`
	Approved    int     `json:"approved"`
	Rejected    int     `json:"rejected"`
	RejectedPct float64 `json:"rejectedPct"`
}

// ConditionDisagreement shows per-condition physician disagreement rates
// (k-anonymity: minimum 3 reviewed cases per condition).
type ConditionDisagreement struct {
	Condition       string  `json:"condition"`
	Reviewed        int     `json:"reviewed"`
	FullyApproved   int     `json:"fullyApproved"`
	Modified        int     `json:"modified"` // physician_ai_output IS NOT NULL
	Rejected        int     `json:"rejected"`
	DisagreementPct float64 `json:"disagreementPct"`
}

// AgreementPatterns is the full AI-physician agreement corpus payload.
// Suitable as a labelled training / evaluation corpus for future diagnostic AI.
type AgreementPatterns struct {
	WeeksBack              int                     `json:"weeksBack"`
	TotalReviewed          int                     `json:"totalReviewed"`
	FullyApproved          int                     `json:"fullyApproved"`    // approved + no edits
	ModifiedApproved       int                     `json:"modifiedApproved"` // approved + physician edit
	Rejected               int                     `json:"rejected"`         // full override
	FullAgreementPct       float64                 `json:"fullAgreementPct"`
	PartialEditPct         float64                 `json:"partialEditPct"`
	DisagreementPct        float64                 `json:"disagreementPct"`
	ByUrgency              []UrgencyAgreement      `json:"byUrgency"`
	TopDisagreedConditions []ConditionDisagreement `json:"topDisagreedConditions"`
}

// GetAgreementPatterns returns labelled AI-physician agreement metrics across
// confidence levels, urgency tiers, and top contested conditions.
func (r *Repository) GetAgreementPatterns(weeksBack int) (*AgreementPatterns, error) {
	ap := &AgreementPatterns{WeeksBack: weeksBack}

	// 1. Top-level agreement summary.
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*) FILTER (WHERE physician_id IS NOT NULL)                                              AS total_reviewed,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved' AND physician_ai_output IS NULL)       AS fully_approved,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved' AND physician_ai_output IS NOT NULL)   AS modified_approved,
		    COUNT(*) FILTER (WHERE physician_decision = 'Rejected')                                      AS rejected
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(
		&ap.TotalReviewed, &ap.FullyApproved,
		&ap.ModifiedApproved, &ap.Rejected,
	)
	if err != nil {
		return nil, fmt.Errorf("agreement summary: %w", err)
	}
	if ap.TotalReviewed > 0 {
		ap.FullAgreementPct = round2(float64(ap.FullyApproved) / float64(ap.TotalReviewed) * 100)
		ap.PartialEditPct = round2(float64(ap.ModifiedApproved) / float64(ap.TotalReviewed) * 100)
		ap.DisagreementPct = round2(float64(ap.Rejected) / float64(ap.TotalReviewed) * 100)
	}

	// 2. Agreement breakdown by urgency.
	urgRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    urgency,
		    COUNT(*)                                                 AS reviewed,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved') AS approved,
		    COUNT(*) FILTER (WHERE physician_decision = 'Rejected') AS rejected
		FROM diagnoses
		WHERE physician_id IS NOT NULL
		  AND created_at >= NOW() - INTERVAL '%d weeks'
		  AND urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
		GROUP BY urgency
		ORDER BY CASE urgency
		    WHEN 'CRITICAL' THEN 1
		    WHEN 'HIGH'     THEN 2
		    WHEN 'MEDIUM'   THEN 3
		    WHEN 'LOW'      THEN 4
		END
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("agreement by urgency: %w", err)
	}
	for urgRows.Next() {
		var ua UrgencyAgreement
		if err := urgRows.Scan(&ua.Urgency, &ua.Reviewed, &ua.Approved, &ua.Rejected); err != nil {
			urgRows.Close()
			return nil, err
		}
		if ua.Reviewed > 0 {
			ua.RejectedPct = round2(float64(ua.Rejected) / float64(ua.Reviewed) * 100)
		}
		ap.ByUrgency = append(ap.ByUrgency, ua)
	}
	urgRows.Close()
	if err := urgRows.Err(); err != nil {
		return nil, err
	}

	// 3. Top conditions by physician disagreement rate (k-anonymity ≥ 3 reviewed).
	condRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    condition,
		    COUNT(*)                                                                                      AS reviewed,
		    COUNT(*) FILTER (WHERE physician_decision = 'Approved' AND physician_ai_output IS NULL)      AS fully_approved,
		    COUNT(*) FILTER (WHERE physician_ai_output IS NOT NULL)                                      AS modified,
		    COUNT(*) FILTER (WHERE physician_decision = 'Rejected')                                      AS rejected
		FROM diagnoses
		WHERE physician_id IS NOT NULL
		  AND created_at >= NOW() - INTERVAL '%d weeks'
		  AND condition IS NOT NULL AND condition <> ''
		GROUP BY condition
		HAVING COUNT(*) >= 3
		ORDER BY COUNT(*) FILTER (WHERE physician_decision = 'Rejected') DESC,
		         COUNT(*) DESC
		LIMIT 12
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("condition disagreement: %w", err)
	}
	for condRows.Next() {
		var cd ConditionDisagreement
		if err := condRows.Scan(&cd.Condition, &cd.Reviewed, &cd.FullyApproved, &cd.Modified, &cd.Rejected); err != nil {
			condRows.Close()
			return nil, err
		}
		if cd.Reviewed > 0 {
			cd.DisagreementPct = round2(float64(cd.Rejected) / float64(cd.Reviewed) * 100)
		}
		ap.TopDisagreedConditions = append(ap.TopDisagreedConditions, cd)
	}
	condRows.Close()
	return ap, condRows.Err()
}

// ─── Escalation Rate Analysis ─────────────────────────────────────────────────

// UrgencyEscalation holds escalation metrics for a single urgency tier,
// showing the empirical confidence-urgency threshold for AI-to-human handoff.
type UrgencyEscalation struct {
	Urgency           string  `json:"urgency"`
	TotalCases        int     `json:"totalCases"`
	EscalatedCount    int     `json:"escalatedCount"`
	EscalationRatePct float64 `json:"escalationRatePct"`
	AvgConfidence     float64 `json:"avgConfidence"` // mean EDIS confidence at this urgency
}

// ConditionEscalation holds per-condition escalation counts (k-anonymity ≥ 3).
type ConditionEscalation struct {
	Condition         string  `json:"condition"`
	TotalCases        int     `json:"totalCases"`
	EscalatedCount    int     `json:"escalatedCount"`
	EscalationRatePct float64 `json:"escalationRatePct"`
}

// EscalationAnalysis is the full payload for the escalation-rate endpoint.
type EscalationAnalysis struct {
	WeeksBack                 int                    `json:"weeksBack"`
	TotalCases                int                    `json:"totalCases"`
	TotalEscalated            int                    `json:"totalEscalated"`
	EscalationRatePct         float64                `json:"escalationRatePct"`
	ClinicalModeCases         int                    `json:"clinicalModeCases"`
	GeneralModeCases          int                    `json:"generalModeCases"`
	ClinicalEscalatedPct      float64                `json:"clinicalEscalatedPct"`
	AvgConfidenceEscalated    float64                `json:"avgConfidenceAtEscalation"`
	AvgConfidenceNonEscalated float64                `json:"avgConfidenceNonEscalated"`
	ByUrgency                 []UrgencyEscalation    `json:"byUrgency"`
	TopEscalatingConditions   []ConditionEscalation  `json:"topEscalatingConditions"`
}

// GetEscalationAnalysis returns empirical data on the AI-to-human clinical
// handoff threshold — escalation rates by urgency level and condition,
// alongside mean EDIS confidence scores at and below the escalation point.
func (r *Repository) GetEscalationAnalysis(weeksBack int) (*EscalationAnalysis, error) {
	ea := &EscalationAnalysis{WeeksBack: weeksBack}

	// 1. Overall escalation stats + mode breakdown + confidence at escalation.
	var clinicalEscalated int
	var avgConfEsc, avgConfNonEsc sql.NullFloat64
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*)                                                               AS total,
		    COUNT(*) FILTER (WHERE escalated = TRUE)                               AS escalated_count,
		    COUNT(*) FILTER (WHERE ai_response->>'mode' = 'clinical')              AS clinical_mode,
		    COUNT(*) FILTER (WHERE ai_response->>'mode' = 'general')               AS general_mode,
		    COUNT(*) FILTER (WHERE escalated = TRUE
		                      AND ai_response->>'mode' = 'clinical')               AS clinical_escalated,
		    ROUND(AVG(
		        CASE WHEN escalated = TRUE
		              AND ai_response->'diagnosis'->>'confidence' ~ '^\d+$'
		             THEN (ai_response->'diagnosis'->>'confidence')::numeric
		        END)::numeric, 2)                                                  AS avg_conf_esc,
		    ROUND(AVG(
		        CASE WHEN escalated = FALSE
		              AND ai_response->'diagnosis'->>'confidence' ~ '^\d+$'
		             THEN (ai_response->'diagnosis'->>'confidence')::numeric
		        END)::numeric, 2)                                                  AS avg_conf_non_esc
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
	`, weeksBack)).Scan(
		&ea.TotalCases, &ea.TotalEscalated,
		&ea.ClinicalModeCases, &ea.GeneralModeCases, &clinicalEscalated,
		&avgConfEsc, &avgConfNonEsc,
	)
	if err != nil {
		return nil, fmt.Errorf("escalation summary: %w", err)
	}
	if ea.TotalCases > 0 {
		ea.EscalationRatePct = round2(float64(ea.TotalEscalated) / float64(ea.TotalCases) * 100)
	}
	if ea.ClinicalModeCases > 0 {
		ea.ClinicalEscalatedPct = round2(float64(clinicalEscalated) / float64(ea.ClinicalModeCases) * 100)
	}
	if avgConfEsc.Valid {
		ea.AvgConfidenceEscalated = float64(avgConfEsc.Float64)
	}
	if avgConfNonEsc.Valid {
		ea.AvgConfidenceNonEscalated = float64(avgConfNonEsc.Float64)
	}

	// 2. Escalation by urgency tier.
	urgRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    urgency,
		    COUNT(*)                                     AS total,
		    COUNT(*) FILTER (WHERE escalated = TRUE)    AS escalated_count,
		    ROUND(AVG(
		        CASE WHEN ai_response->'diagnosis'->>'confidence' ~ '^\d+$'
		             THEN (ai_response->'diagnosis'->>'confidence')::numeric
		        END)::numeric, 2)                        AS avg_conf
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
		  AND urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
		GROUP BY urgency
		ORDER BY CASE urgency
		    WHEN 'CRITICAL' THEN 1
		    WHEN 'HIGH'     THEN 2
		    WHEN 'MEDIUM'   THEN 3
		    WHEN 'LOW'      THEN 4
		END
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("escalation by urgency: %w", err)
	}
	for urgRows.Next() {
		var ue UrgencyEscalation
		var avgConf sql.NullFloat64
		if err := urgRows.Scan(&ue.Urgency, &ue.TotalCases, &ue.EscalatedCount, &avgConf); err != nil {
			urgRows.Close()
			return nil, err
		}
		if ue.TotalCases > 0 {
			ue.EscalationRatePct = round2(float64(ue.EscalatedCount) / float64(ue.TotalCases) * 100)
		}
		if avgConf.Valid {
			ue.AvgConfidence = float64(avgConf.Float64)
		}
		ea.ByUrgency = append(ea.ByUrgency, ue)
	}
	urgRows.Close()
	if err := urgRows.Err(); err != nil {
		return nil, err
	}

	// 3. Top escalating conditions (k-anonymity: ≥ 3 total AND ≥ 3 escalated).
	condRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    condition,
		    COUNT(*)                                     AS total,
		    COUNT(*) FILTER (WHERE escalated = TRUE)    AS escalated_count
		FROM diagnoses
		WHERE created_at >= NOW() - INTERVAL '%d weeks'
		  AND condition IS NOT NULL AND condition <> ''
		GROUP BY condition
		HAVING COUNT(*) >= 3
		  AND COUNT(*) FILTER (WHERE escalated = TRUE) >= 3
		ORDER BY COUNT(*) FILTER (WHERE escalated = TRUE) DESC
		LIMIT 12
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("escalation by condition: %w", err)
	}
	for condRows.Next() {
		var ce ConditionEscalation
		if err := condRows.Scan(&ce.Condition, &ce.TotalCases, &ce.EscalatedCount); err != nil {
			condRows.Close()
			return nil, err
		}
		if ce.TotalCases > 0 {
			ce.EscalationRatePct = round2(float64(ce.EscalatedCount) / float64(ce.TotalCases) * 100)
		}
		ea.TopEscalatingConditions = append(ea.TopEscalatingConditions, ce)
	}
	condRows.Close()
	return ea, condRows.Err()
}
