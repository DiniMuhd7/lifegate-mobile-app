// Package resourcegaps identifies conditions that are chronically
// under-resourced in specific geographies — i.e. states with high disease
// burden but few or no physicians with the matching specialization.
package resourcegaps

import (
	"database/sql"
	"fmt"
	"strings"
)

// conditionKeyword maps a lower-cased substring found in a condition name to
// the primary specialist type needed to manage that condition.
type conditionKeyword struct {
	keyword   string
	specialty string
}

// specialtyIndex is searched in order; the first match wins.
var specialtyIndex = []conditionKeyword{
	{"hypertension", "Cardiologist"},
	{"cardiac", "Cardiologist"},
	{"heart fail", "Cardiologist"},
	{"heart dis", "Cardiologist"},
	{"coronary", "Cardiologist"},
	{"diabetes", "Endocrinologist"},
	{"thyroid", "Endocrinologist"},
	{"endocrine", "Endocrinologist"},
	{"tuberculosis", "Pulmonologist"},
	{" tb ", "Pulmonologist"},
	{"asthma", "Pulmonologist"},
	{"pneumonia", "Pulmonologist"},
	{"respiratory", "Pulmonologist"},
	{"stroke", "Neurologist"},
	{"epilepsy", "Neurologist"},
	{"seizure", "Neurologist"},
	{"migraine", "Neurologist"},
	{"malaria", "Infectious Disease Specialist"},
	{"hiv", "Infectious Disease Specialist"},
	{"aids", "Infectious Disease Specialist"},
	{"typhoid", "Infectious Disease Specialist"},
	{"cholera", "Infectious Disease Specialist"},
	{"meningitis", "Infectious Disease Specialist"},
	{"lassa", "Infectious Disease Specialist"},
	{"kidney", "Nephrologist"},
	{"renal", "Nephrologist"},
	{"mental health", "Psychiatrist"},
	{"depression", "Psychiatrist"},
	{"anxiety", "Psychiatrist"},
	{"psychosis", "Psychiatrist"},
	{"schizophrenia", "Psychiatrist"},
	{"pregnancy", "Obstetrician/Gynaecologist"},
	{"obstetric", "Obstetrician/Gynaecologist"},
	{"antenatal", "Obstetrician/Gynaecologist"},
	{"cancer", "Oncologist"},
	{"tumour", "Oncologist"},
	{"tumor", "Oncologist"},
	{"sickle", "Haematologist"},
	{"anaemia", "Haematologist"},
	{"anemia", "Haematologist"},
	{"liver", "Gastroenterologist"},
	{"hepat", "Gastroenterologist"},
	{"gastro", "Gastroenterologist"},
	{"eye", "Ophthalmologist"},
	{"vision", "Ophthalmologist"},
	{"glaucoma", "Ophthalmologist"},
}

func specialtyFor(condition string) string {
	lower := strings.ToLower(condition)
	for _, c := range specialtyIndex {
		if strings.Contains(lower, c.keyword) {
			return c.specialty
		}
	}
	return "General Practitioner"
}

// Repository reads from the existing surveillance + users tables.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// ResourceGap describes a single (state, condition) pair where the disease
// burden substantially exceeds available specialist coverage.
type ResourceGap struct {
	State            string `json:"state"`
	ConditionName    string `json:"conditionName"`
	TotalCases       int    `json:"totalCases"`
	RelatedSpecialty string `json:"relatedSpecialty"`
	SpecialistCount  int    `json:"specialistCount"`
	// GapSeverity: "critical" = 0 specialists, "high" = 1-2, "moderate" = 3-4
	GapSeverity string `json:"gapSeverity"`
}

// GapsResponse is the full payload returned by the public endpoint.
type GapsResponse struct {
	TotalGaps      int           `json:"totalGaps"`
	CriticalGaps   int           `json:"criticalGaps"`
	StatesAffected int           `json:"statesAffected"`
	Gaps           []ResourceGap `json:"gaps"`
}

// GetGaps returns conditions with high burden but insufficient specialist
// coverage per state. weeksBack is the surveillance window (4-104), limit
// caps the returned gaps (1-50).
func (r *Repository) GetGaps(weeksBack, limit int) (*GapsResponse, error) {
	// Step 1: fetch aggregated condition burden per state over the window.
	burdenRows, err := r.getConditionBurden(weeksBack)
	if err != nil {
		return nil, fmt.Errorf("getConditionBurden: %w", err)
	}

	// Step 2: fetch active physician counts per (state, specialization).
	physicianMap, err := r.getPhysiciansByStateAndSpecialty()
	if err != nil {
		return nil, fmt.Errorf("getPhysiciansByStateAndSpecialty: %w", err)
	}

	// Step 3: application-layer join + gap calculation.
	statesSeen := map[string]struct{}{}
	var gaps []ResourceGap
	for _, b := range burdenRows {
		if b.totalCases < 3 {
			continue // k-anonymity
		}
		specialty := specialtyFor(b.conditionName)
		key := stateSpecialtyKey(b.state, specialty)
		specCount := physicianMap[key]

		if specCount >= 5 {
			continue // adequately covered
		}
		severity := gapSeverity(specCount)
		gaps = append(gaps, ResourceGap{
			State:            b.state,
			ConditionName:    b.conditionName,
			TotalCases:       b.totalCases,
			RelatedSpecialty: specialty,
			SpecialistCount:  specCount,
			GapSeverity:      severity,
		})
		statesSeen[b.state] = struct{}{}
	}

	// Sort: critical first, then by totalCases descending.
	sortGaps(gaps)

	if len(gaps) > limit {
		gaps = gaps[:limit]
	}

	critical := 0
	for _, g := range gaps {
		if g.GapSeverity == "critical" {
			critical++
		}
	}

	return &GapsResponse{
		TotalGaps:      len(gaps),
		CriticalGaps:   critical,
		StatesAffected: len(statesSeen),
		Gaps:           gaps,
	}, nil
}

type burdenRow struct {
	conditionName string
	state         string
	totalCases    int
}

func (r *Repository) getConditionBurden(weeksBack int) ([]burdenRow, error) {
	cutoff := fmt.Sprintf("NOW() - INTERVAL '%d weeks'", weeksBack)
	q := `
SELECT condition_name,
       COALESCE(state, 'Unknown') AS state,
       SUM(case_count)            AS total_cases
FROM   surveillance_condition_counts
WHERE  period_start >= ` + cutoff + `
  AND  country = 'Nigeria'
  AND  state IS NOT NULL AND state <> '' AND state <> 'Unknown'
GROUP  BY condition_name, state
HAVING SUM(case_count) >= 3
ORDER  BY total_cases DESC
`
	rows, err := r.db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []burdenRow
	for rows.Next() {
		var b burdenRow
		if err := rows.Scan(&b.conditionName, &b.state, &b.totalCases); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *Repository) getPhysiciansByStateAndSpecialty() (map[string]int, error) {
	q := `
SELECT LOWER(TRIM(COALESCE(state, ''))),
       LOWER(TRIM(COALESCE(specialization, ''))),
       COUNT(*)
FROM   users
WHERE  role = 'professional'
  AND  state IS NOT NULL AND state <> ''
  AND  specialization IS NOT NULL AND specialization <> ''
GROUP  BY 1, 2
`
	rows, err := r.db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Build a map: for each (state, specialty) pair, store the count.
	// We store the count under a normalised key so we can do partial matching
	// from specialtyIndex (the specialty column may use different terminology
	// from our display labels, e.g. "cardiologist" vs "Cardiologist").
	raw := map[string]int{}
	for rows.Next() {
		var state, spec string
		var cnt int
		if err := rows.Scan(&state, &spec, &cnt); err != nil {
			return nil, err
		}
		raw[state+"||"+spec] = cnt
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Now build the aggregated map keyed by (lower(state), displaySpecialty).
	// We aggregate because a physician column might say "cardiology" or
	// "cardiologist" — we match any substring of the specialty keyword.
	out := map[string]int{}
	for _, cs := range specialtyIndex {
		// Build set of known display specialties to aggregate for.
		_ = cs // we'll do the aggregation below
	}
	for rawKey, cnt := range raw {
		parts := strings.SplitN(rawKey, "||", 2)
		if len(parts) != 2 {
			continue
		}
		state, dbSpec := parts[0], parts[1]
		// Map dbSpec → display specialty using the same keyword index.
		display := specialtyForDB(dbSpec)
		key := stateSpecialtyKey(state, display)
		out[key] += cnt
	}
	return out, nil
}

// specialtyForDB maps a physician's stored specialization string to the same
// display specialty labels used by specialtyFor().
func specialtyForDB(dbSpec string) string {
	lower := strings.ToLower(dbSpec)
	for _, c := range specialtyIndex {
		if strings.Contains(lower, c.keyword) {
			return c.specialty
		}
	}
	// Try reverse: does the dbSpec contain the display specialty?
	displaySpecialties := []string{
		"Cardiologist", "Endocrinologist", "Pulmonologist", "Neurologist",
		"Infectious Disease Specialist", "Nephrologist", "Psychiatrist",
		"Obstetrician/Gynaecologist", "Oncologist", "Haematologist",
		"Gastroenterologist", "Ophthalmologist", "General Practitioner",
	}
	for _, ds := range displaySpecialties {
		if strings.Contains(lower, strings.ToLower(ds)) {
			return ds
		}
	}
	return "General Practitioner"
}

func stateSpecialtyKey(state, specialty string) string {
	return strings.ToLower(strings.TrimSpace(state)) + "||" + specialty
}

func gapSeverity(specialists int) string {
	switch {
	case specialists == 0:
		return "critical"
	case specialists <= 2:
		return "high"
	default:
		return "moderate"
	}
}

func sortGaps(gaps []ResourceGap) {
	severityOrder := map[string]int{"critical": 0, "high": 1, "moderate": 2}
	// Simple insertion sort — output is typically small (<200 rows).
	for i := 1; i < len(gaps); i++ {
		j := i
		for j > 0 {
			a, b := gaps[j-1], gaps[j]
			aOrd, bOrd := severityOrder[a.GapSeverity], severityOrder[b.GapSeverity]
			if aOrd > bOrd || (aOrd == bOrd && a.TotalCases < b.TotalCases) {
				gaps[j-1], gaps[j] = gaps[j], gaps[j-1]
				j--
			} else {
				break
			}
		}
	}
}
