// Package healthaccess computes per-state healthcare access metrics for the
// LifeGate Public Health Analytics Dashboard.
//
// All queries are fully aggregated at state level; no patient or physician
// identifiers are ever surfaced.  A k-anonymity threshold of 3 cases is
// enforced via HAVING clauses to protect sparse regions.
package healthaccess

import (
	"database/sql"
	"fmt"
	"math"
	"time"
)

const kAnonThreshold = 3

// Repository performs all healthaccess database queries.
type Repository struct {
	db *sql.DB
}

// NewRepository creates a new Repository.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ─── Domain types ─────────────────────────────────────────────────────────────

// StateAccessMetric is the full set of access indicators for one state.
type StateAccessMetric struct {
	State             string  `json:"state"`
	TotalCases        int     `json:"totalCases"`
	AvgResponseHours  float64 `json:"avgResponseHours"`  // mean time-to-assign in hours
	SLABreachCount    int     `json:"slaBreachCount"`    // cases where assign > 4 h
	SLABreachRate     float64 `json:"slaBreachRate"`     // 0.0 – 1.0
	ActivePhysicians  int     `json:"activePhysicians"`  // distinct physicians in window
	AccessGapScore    float64 `json:"accessGapScore"`    // composite; higher = worse access
	IsDesert          bool    `json:"isDesert"`          // top-quartile gap + any breaches
}

// SummaryMetrics is headline aggregate across all states.
type SummaryMetrics struct {
	TotalStates       int       `json:"totalStates"`
	DesertStates      int       `json:"desertStates"`    // IsDesert == true
	NationalBreachRate float64  `json:"nationalBreachRate"`
	AvgResponseHours  float64  `json:"avgResponseHours"`
	LastUpdated       time.Time `json:"lastUpdated"`
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// GetByState returns healthcare-access metrics for every state that has at
// least kAnonThreshold cases within the given weeksBack window.
// Results are ordered by AccessGapScore descending (worst first).
func (r *Repository) GetByState(weeksBack int) ([]StateAccessMetric, error) {
	const q = `
		WITH state_agg AS (
			SELECT
				COALESCE(u.state, 'Unknown')                                AS state,
				COUNT(*)                                                    AS total_cases,
				ROUND(
					AVG(
						CASE WHEN d.physician_assigned_at IS NOT NULL
						     THEN EXTRACT(EPOCH FROM
						               (d.physician_assigned_at - d.created_at)) / 3600.0
						END
					)::NUMERIC, 1
				)                                                           AS avg_response_hours,
				COUNT(
					CASE WHEN d.physician_assigned_at IS NOT NULL
					          AND d.physician_assigned_at >
					              d.created_at + INTERVAL '4 hours'
					     THEN 1 END
				)                                                           AS sla_breach_count,
				COUNT(DISTINCT d.physician_id)
					FILTER (WHERE d.physician_assigned_at IS NOT NULL)      AS active_physicians
			FROM diagnoses d
			JOIN users u ON u.id = d.user_id
			WHERE d.created_at >= NOW() - ($1::INT * 7) * INTERVAL '1 day'
			  AND u.state IS NOT NULL
			  AND u.state <> ''
			  AND u.state <> 'Unknown'
			GROUP BY COALESCE(u.state, 'Unknown')
			HAVING COUNT(*) >= $2
		)
		SELECT
			state,
			total_cases,
			COALESCE(avg_response_hours, 0)                                AS avg_response_hours,
			sla_breach_count,
			CASE WHEN total_cases > 0
			     THEN ROUND((sla_breach_count::NUMERIC / total_cases), 4)
			     ELSE 0
			END                                                            AS sla_breach_rate,
			active_physicians,
			-- AccessGapScore: 40% weighted normalised response time + 60% breach rate
			-- Response time normalised by 24 h (a full day response = 1.0 component).
			ROUND((
				LEAST(COALESCE(avg_response_hours, 0) / 24.0, 1.0) * 0.4 +
				CASE WHEN total_cases > 0
				     THEN (sla_breach_count::NUMERIC / total_cases) * 0.6
				     ELSE 0
				END
			)::NUMERIC, 4)                                                 AS access_gap_score
		FROM state_agg
		ORDER BY access_gap_score DESC, total_cases DESC
	`

	rows, err := r.db.Query(q, weeksBack, kAnonThreshold)
	if err != nil {
		return nil, fmt.Errorf("healthaccess: by-state: %w", err)
	}
	defer rows.Close()

	var out []StateAccessMetric
	for rows.Next() {
		var m StateAccessMetric
		var avgResp, breachRate, gapScore sql.NullFloat64
		if err := rows.Scan(
			&m.State,
			&m.TotalCases,
			&avgResp,
			&m.SLABreachCount,
			&breachRate,
			&m.ActivePhysicians,
			&gapScore,
		); err != nil {
			continue
		}
		m.AvgResponseHours = math.Round(avgResp.Float64*10) / 10
		m.SLABreachRate = math.Round(breachRate.Float64*1000) / 1000
		m.AccessGapScore = math.Round(gapScore.Float64*1000) / 1000
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Mark top-quartile gap scores with any SLA breaches as "deserts".
	if len(out) > 0 {
		q75idx := len(out) / 4
		if q75idx == 0 {
			q75idx = 1
		}
		q75score := out[q75idx-1].AccessGapScore
		for i := range out {
			out[i].IsDesert = out[i].AccessGapScore >= q75score && out[i].SLABreachCount > 0
		}
	}

	return out, nil
}

// GetSummary returns national-level aggregate access metrics.
func (r *Repository) GetSummary(weeksBack int) (*SummaryMetrics, error) {
	const q = `
		WITH state_agg AS (
			SELECT
				COUNT(*)                                                    AS total_cases,
				COUNT(
					CASE WHEN d.physician_assigned_at IS NOT NULL
					          AND d.physician_assigned_at >
					              d.created_at + INTERVAL '4 hours'
					     THEN 1 END
				)                                                           AS sla_breach_count,
				AVG(
					CASE WHEN d.physician_assigned_at IS NOT NULL
					     THEN EXTRACT(EPOCH FROM
					               (d.physician_assigned_at - d.created_at)) / 3600.0
					END
				)                                                           AS avg_response_hours
			FROM diagnoses d
			JOIN users u ON u.id = d.user_id
			WHERE d.created_at >= NOW() - ($1::INT * 7) * INTERVAL '1 day'
			  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
		)
		SELECT
			total_cases,
			CASE WHEN total_cases > 0
			     THEN ROUND((sla_breach_count::NUMERIC / total_cases), 4)
			     ELSE 0
			END,
			COALESCE(ROUND(avg_response_hours::NUMERIC, 1), 0)
		FROM state_agg
	`

	s := &SummaryMetrics{LastUpdated: time.Now().UTC()}
	var totalCases, breachCount int
	var breachRate, avgHours sql.NullFloat64

	err := r.db.QueryRow(q, weeksBack).Scan(&totalCases, &breachRate, &avgHours)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("healthaccess: summary: %w", err)
	}
	_ = totalCases
	_ = breachCount
	s.NationalBreachRate = math.Round(breachRate.Float64*1000) / 1000
	s.AvgResponseHours = math.Round(avgHours.Float64*10) / 10

	// Count states and desert states.
	r.db.QueryRow(`
		SELECT COUNT(DISTINCT u.state)
		FROM diagnoses d
		JOIN users u ON u.id = d.user_id
		WHERE d.created_at >= NOW() - ($1::INT * 7) * INTERVAL '1 day'
		  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
	`, weeksBack).Scan(&s.TotalStates)

	// Desert states: states where SLA breach rate > national average.
	r.db.QueryRow(`
		WITH by_state AS (
			SELECT
				COALESCE(u.state,'Unknown') AS state,
				COUNT(*) AS tc,
				COUNT(CASE WHEN d.physician_assigned_at > d.created_at + INTERVAL '4 hours'
				           THEN 1 END) AS bc
			FROM diagnoses d
			JOIN users u ON u.id = d.user_id
			WHERE d.created_at >= NOW() - ($1::INT * 7) * INTERVAL '1 day'
			  AND u.state IS NOT NULL AND u.state <> '' AND u.state <> 'Unknown'
			GROUP BY COALESCE(u.state,'Unknown')
			HAVING COUNT(*) >= $2
		)
		SELECT COUNT(*) FROM by_state
		WHERE tc > 0 AND (bc::float / tc) > $3
	`, weeksBack, kAnonThreshold, breachRate.Float64).Scan(&s.DesertStates)

	return s, nil
}
