// Package demography provides two public analytics endpoints:
//  1. Anonymised symptom burden by age group and sex
//  2. Follow-up re-engagement metrics (care pathway dropout analysis)
//
// All queries enforce k-anonymity (≥ 3 cases per cell) and return only
// aggregate, state-level statistics — no personally identifiable information.
package demography

import (
	"database/sql"
	"fmt"
	"strings"
)

// Repository reads from diagnoses and users tables.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ─── Shared age-bucketing SQL expression ─────────────────────────────────────
// Returns an age bucket label, or 'Unknown' if the dob cannot be parsed.
// Handles ISO (YYYY-MM-DD), Nigerian day-first with slashes (DD/MM/YYYY),
// and Nigerian day-first with dashes (DD-MM-YYYY).
const ageBucketExpr = `
  CASE
    WHEN u.dob ~ '^\d{4}-\d{2}-\d{2}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.dob::date)) >= 60            THEN '60+'
        ELSE 'Unknown'
      END
    WHEN u.dob ~ '^\d{2}/\d{2}/\d{4}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD/MM/YYYY'))) >= 60            THEN '60+'
        ELSE 'Unknown'
      END
    WHEN u.dob ~ '^\d{2}-\d{2}-\d{4}$' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 0  AND 17 THEN '0-17'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 18 AND 29 THEN '18-29'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 30 AND 44 THEN '30-44'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) BETWEEN 45 AND 59 THEN '45-59'
        WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, TO_DATE(u.dob,'DD-MM-YYYY'))) >= 60            THEN '60+'
        ELSE 'Unknown'
      END
    ELSE 'Unknown'
  END`

// normalised gender expression.
const genderExpr = `
  CASE
    WHEN LOWER(TRIM(u.gender)) IN ('male','m','man','boy') THEN 'Male'
    WHEN LOWER(TRIM(u.gender)) IN ('female','f','woman','girl') THEN 'Female'
    ELSE 'Other'
  END`

// ─── Demographic Burden ───────────────────────────────────────────────────────

// ConditionShare is a condition with a case count for one demographic cell.
type ConditionShare struct {
	ConditionName string `json:"conditionName"`
	CaseCount     int    `json:"caseCount"`
}

// AgeGroupRow holds total cases and top conditions for one age group.
type AgeGroupRow struct {
	AgeGroup      string           `json:"ageGroup"`
	TotalCases    int              `json:"totalCases"`
	TopConditions []ConditionShare `json:"topConditions"`
}

// SexRow holds total cases and top conditions for one sex category.
type SexRow struct {
	Sex           string           `json:"sex"`
	TotalCases    int              `json:"totalCases"`
	TopConditions []ConditionShare `json:"topConditions"`
}

// BurdenResponse is the full payload for the demographic burden endpoint.
type BurdenResponse struct {
	// WeeksBack is echoed for transparency.
	WeeksBack  int           `json:"weeksBack"`
	ByAgeGroup []AgeGroupRow `json:"byAgeGroup"`
	BySex      []SexRow      `json:"bySex"`
}

// GetBurden returns anonymised condition burden split by age group and sex.
func (r *Repository) GetBurden(weeksBack int) (*BurdenResponse, error) {
	resp := &BurdenResponse{WeeksBack: weeksBack}

	// 1. Age group breakdown.
	ageRows, err := r.db.Query(fmt.Sprintf(`
		SELECT age_group, condition, COUNT(*) AS cnt
		FROM (
		    SELECT d.condition, %s AS age_group
		    FROM   diagnoses d
		    JOIN   users u ON u.id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d.condition IS NOT NULL AND d.condition <> ''
		      AND  u.role = 'user'
		      AND  u.dob IS NOT NULL AND u.dob <> ''
		) sub
		WHERE age_group <> 'Unknown'
		GROUP BY age_group, condition
		HAVING COUNT(*) >= 3
		ORDER BY age_group,
		         CASE age_group
		           WHEN '0-17'  THEN 1
		           WHEN '18-29' THEN 2
		           WHEN '30-44' THEN 3
		           WHEN '45-59' THEN 4
		           WHEN '60+'   THEN 5
		         END,
		         cnt DESC
	`, ageBucketExpr, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("age burden: %w", err)
	}
	defer ageRows.Close()

	ageMap := map[string]*AgeGroupRow{}
	ageOrder := []string{"0-17", "18-29", "30-44", "45-59", "60+"}
	for ageRows.Next() {
		var ag, cond string
		var cnt int
		if err := ageRows.Scan(&ag, &cond, &cnt); err != nil {
			return nil, err
		}
		if _, ok := ageMap[ag]; !ok {
			ageMap[ag] = &AgeGroupRow{AgeGroup: ag}
		}
		row := ageMap[ag]
		row.TotalCases += cnt
		if len(row.TopConditions) < 5 {
			row.TopConditions = append(row.TopConditions, ConditionShare{cond, cnt})
		}
	}
	if err := ageRows.Err(); err != nil {
		return nil, err
	}
	for _, ag := range ageOrder {
		if row, ok := ageMap[ag]; ok {
			resp.ByAgeGroup = append(resp.ByAgeGroup, *row)
		}
	}

	// 2. Sex breakdown.
	sexRows, err := r.db.Query(fmt.Sprintf(`
		SELECT sex, condition, COUNT(*) AS cnt
		FROM (
		    SELECT d.condition, %s AS sex
		    FROM   diagnoses d
		    JOIN   users u ON u.id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d.condition IS NOT NULL AND d.condition <> ''
		      AND  u.role = 'user'
		      AND  u.gender IS NOT NULL AND u.gender <> ''
		) sub
		WHERE sex <> 'Other'
		GROUP BY sex, condition
		HAVING COUNT(*) >= 3
		ORDER BY sex, cnt DESC
	`, genderExpr, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("sex burden: %w", err)
	}
	defer sexRows.Close()

	sexMap := map[string]*SexRow{}
	for sexRows.Next() {
		var sex, cond string
		var cnt int
		if err := sexRows.Scan(&sex, &cond, &cnt); err != nil {
			return nil, err
		}
		if _, ok := sexMap[sex]; !ok {
			sexMap[sex] = &SexRow{Sex: sex}
		}
		row := sexMap[sex]
		row.TotalCases += cnt
		if len(row.TopConditions) < 6 {
			row.TopConditions = append(row.TopConditions, ConditionShare{cond, cnt})
		}
	}
	if err := sexRows.Err(); err != nil {
		return nil, err
	}
	for _, sex := range []string{"Male", "Female"} {
		if row, ok := sexMap[sex]; ok {
			resp.BySex = append(resp.BySex, *row)
		}
	}

	return resp, nil
}

// ─── Follow-up / Re-engagement ───────────────────────────────────────────────

// AgeFollowUp holds follow-up adherence stats for one age group.
type AgeFollowUp struct {
	AgeGroup   string  `json:"ageGroup"`
	Scheduled  int     `json:"scheduled"`
	Completed  int     `json:"completed"`
	Dropout    int     `json:"dropout"`
	DropoutPct float64 `json:"dropoutPct"`
}

// SexFollowUp holds follow-up adherence stats broken down by sex.
type SexFollowUp struct {
	Sex        string  `json:"sex"`
	Scheduled  int     `json:"scheduled"`
	Completed  int     `json:"completed"`
	Dropout    int     `json:"dropout"`
	DropoutPct float64 `json:"dropoutPct"`
}

// StateFollowUp holds follow-up adherence stats for one state.
type StateFollowUp struct {
	State      string  `json:"state"`
	Scheduled  int     `json:"scheduled"`
	Completed  int     `json:"completed"`
	Dropout    int     `json:"dropout"`
	DropoutPct float64 `json:"dropoutPct"`
}

// FollowUpStats is the full payload for the follow-up endpoint.
type FollowUpStats struct {
	WeeksBack        int             `json:"weeksBack"`
	TotalScheduled   int             `json:"totalScheduled"`
	CompletedCount   int             `json:"completedCount"`
	DropoutCount     int             `json:"dropoutCount"`
	NationalDropout  float64         `json:"nationalDropoutPct"`
	ByAgeGroup       []AgeFollowUp   `json:"byAgeGroup"`
	BySex            []SexFollowUp   `json:"bySex"`
	ByState          []StateFollowUp `json:"byState"`
}

// GetFollowUpStats returns care pathway dropout and completion metrics.
// A "dropout" is a case where follow_up_date was set, the date has passed,
// the patient was notified, but outcome_checked remains FALSE.
func (r *Repository) GetFollowUpStats(weeksBack int) (*FollowUpStats, error) {
	stats := &FollowUpStats{WeeksBack: weeksBack}

	// 1. National totals.
	err := r.db.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(*)                                                         AS scheduled,
		    COUNT(*) FILTER (WHERE outcome_checked = TRUE)                  AS completed,
		    COUNT(*) FILTER (WHERE outcome_checked = FALSE
		                      AND follow_up_date < NOW()
		                      AND follow_up_notified_at IS NOT NULL)        AS dropout
		FROM diagnoses
		WHERE created_at      >= NOW() - INTERVAL '%d weeks'
		  AND follow_up_date  IS NOT NULL
	`, weeksBack)).Scan(&stats.TotalScheduled, &stats.CompletedCount, &stats.DropoutCount)
	if err != nil {
		return nil, fmt.Errorf("national totals: %w", err)
	}
	if stats.TotalScheduled > 0 {
		stats.NationalDropout = round2(float64(stats.DropoutCount) / float64(stats.TotalScheduled) * 100)
	}

	// 2. By age group.
	ageRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    age_group,
		    COUNT(*)                                                          AS scheduled,
		    COUNT(*) FILTER (WHERE outcome_checked = TRUE)                   AS completed,
		    COUNT(*) FILTER (WHERE outcome_checked = FALSE
		                      AND follow_up_date < NOW()
		                      AND follow_up_notified_at IS NOT NULL)         AS dropout
		FROM (
		    SELECT d.follow_up_date, d.outcome_checked, d.follow_up_notified_at,
		           %s AS age_group
		    FROM   diagnoses d
		    JOIN   users u ON u.id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d.follow_up_date IS NOT NULL
		      AND  u.role = 'user'
		      AND  u.dob IS NOT NULL AND u.dob <> ''
		) sub
		WHERE age_group <> 'Unknown'
		GROUP BY age_group
		HAVING COUNT(*) >= 3
		ORDER BY CASE age_group
		    WHEN '0-17'  THEN 1
		    WHEN '18-29' THEN 2
		    WHEN '30-44' THEN 3
		    WHEN '45-59' THEN 4
		    WHEN '60+'   THEN 5
		    ELSE 99
		END
	`, ageBucketExpr, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("age follow-up: %w", err)
	}
	defer ageRows.Close()
	for ageRows.Next() {
		var r AgeFollowUp
		if err := ageRows.Scan(&r.AgeGroup, &r.Scheduled, &r.Completed, &r.Dropout); err != nil {
			return nil, err
		}
		if r.Scheduled > 0 {
			r.DropoutPct = round2(float64(r.Dropout) / float64(r.Scheduled) * 100)
		}
		stats.ByAgeGroup = append(stats.ByAgeGroup, r)
	}
	if err := ageRows.Err(); err != nil {
		return nil, err
	}

	// 3. By sex.
	sexRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    sex,
		    COUNT(*)                                                          AS scheduled,
		    COUNT(*) FILTER (WHERE outcome_checked = TRUE)                   AS completed,
		    COUNT(*) FILTER (WHERE outcome_checked = FALSE
		                      AND follow_up_date < NOW()
		                      AND follow_up_notified_at IS NOT NULL)         AS dropout
		FROM (
		    SELECT d.follow_up_date, d.outcome_checked, d.follow_up_notified_at,
		           %s AS sex
		    FROM   diagnoses d
		    JOIN   users u ON u.id = d.user_id
		    WHERE  d.created_at >= NOW() - INTERVAL '%d weeks'
		      AND  d.follow_up_date IS NOT NULL
		      AND  u.role = 'user'
		      AND  u.gender IS NOT NULL AND u.gender <> ''
		) sub
		WHERE sex <> 'Other'
		GROUP BY sex
		HAVING COUNT(*) >= 3
		ORDER BY sex
	`, genderExpr, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("sex follow-up: %w", err)
	}
	defer sexRows.Close()
	for sexRows.Next() {
		var r SexFollowUp
		if err := sexRows.Scan(&r.Sex, &r.Scheduled, &r.Completed, &r.Dropout); err != nil {
			return nil, err
		}
		if r.Scheduled > 0 {
			r.DropoutPct = round2(float64(r.Dropout) / float64(r.Scheduled) * 100)
		}
		stats.BySex = append(stats.BySex, r)
	}
	if err := sexRows.Err(); err != nil {
		return nil, err
	}

	// 4. By state (top 10 highest-dropout states, k-anon ≥ 3).
	stateRows, err := r.db.Query(fmt.Sprintf(`
		SELECT
		    COALESCE(u.state, 'Unknown')                                      AS state,
		    COUNT(*)                                                           AS scheduled,
		    COUNT(*) FILTER (WHERE d.outcome_checked = TRUE)                  AS completed,
		    COUNT(*) FILTER (WHERE d.outcome_checked = FALSE
		                      AND  d.follow_up_date < NOW()
		                      AND  d.follow_up_notified_at IS NOT NULL)       AS dropout
		FROM  diagnoses d
		JOIN  users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - INTERVAL '%d weeks'
		  AND d.follow_up_date IS NOT NULL
		  AND u.role = 'user'
		  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
		GROUP BY COALESCE(u.state, 'Unknown')
		HAVING COUNT(*) >= 3
		ORDER BY (COUNT(*) FILTER (WHERE d.outcome_checked = FALSE
		                            AND d.follow_up_date < NOW()
		                            AND d.follow_up_notified_at IS NOT NULL)
		          ::float / NULLIF(COUNT(*),0)) DESC,
		         COUNT(*) DESC
		LIMIT 10
	`, weeksBack))
	if err != nil {
		return nil, fmt.Errorf("state follow-up: %w", err)
	}
	defer stateRows.Close()
	for stateRows.Next() {
		var r StateFollowUp
		if err := stateRows.Scan(&r.State, &r.Scheduled, &r.Completed, &r.Dropout); err != nil {
			return nil, err
		}
		if r.Scheduled > 0 {
			r.DropoutPct = round2(float64(r.Dropout) / float64(r.Scheduled) * 100)
		}
		stats.ByState = append(stats.ByState, r)
	}
	return stats, stateRows.Err()
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// normaliseGender maps raw gender strings to display labels for use in Go-side
// aggregation if needed (mirrors the SQL genderExpr logic).
func normaliseGender(g string) string {
	switch strings.ToLower(strings.TrimSpace(g)) {
	case "male", "m", "man", "boy":
		return "Male"
	case "female", "f", "woman", "girl":
		return "Female"
	default:
		return "Other"
	}
}

var _ = normaliseGender // suppress unused warning
