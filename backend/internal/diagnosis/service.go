package diagnosis

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

// HPIDetail is the structured symptom profile (OLDCARTS) collected during triage.
type HPIDetail struct {
	Onset         string `json:"onset,omitempty"`
	Duration      string `json:"duration,omitempty"`
	SeverityScore int    `json:"severityScore,omitempty"`
	Location      string `json:"location,omitempty"`
	Character     string `json:"character,omitempty"`
}

// DiagnosisDetail is the full patient-facing diagnosis record returned from the API.
type DiagnosisDetail struct {
	ID                   string               `json:"id"`
	Title                string               `json:"title"`
	Description          string               `json:"description"`
	Condition            string               `json:"condition"`
	Urgency              string               `json:"urgency"`
	Confidence           int                  `json:"confidence"`
	Status               string               `json:"status"`
	Escalated            bool                 `json:"escalated"`
	HasPrescription      bool                 `json:"hasPrescription"`
	// TriageNotes holds the structured HPI (History of Present Illness) collected
	// from the patient during EDIS triage — onset, duration, severity, location, character.
	TriageNotes          *HPIDetail           `json:"triageNotes,omitempty"`
	PhysicianDecision    string               `json:"physicianDecision,omitempty"`
	PhysicianNotes       string               `json:"physicianNotes,omitempty"`
	PhysicianName        string               `json:"physicianName,omitempty"`
	PhysicianHealthTips  string               `json:"physicianHealthTips,omitempty"`
	FollowUpDate         string               `json:"followUpDate,omitempty"`
	FollowUpInstructions string               `json:"followUpInstructions,omitempty"`
	OutcomeChecked       bool                 `json:"outcomeChecked"`
	Prescription         *PrescriptionDetail  `json:"prescription,omitempty"`
	Prescriptions        []PrescriptionDetail  `json:"prescriptions,omitempty"`
	Investigations       []InvestigationDetail `json:"investigations,omitempty"`
	Conditions           []ConditionScoreDetail `json:"conditions,omitempty"`
	CreatedAt            string               `json:"createdAt"`
	UpdatedAt            string               `json:"updatedAt"`
}

// PrescriptionDetail is the prescription extracted from the AI response JSON.
type PrescriptionDetail struct {
	Medicine     string `json:"medicine"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Instructions string `json:"instructions,omitempty"`
}

// InvestigationDetail is a recommended test returned to the patient.
type InvestigationDetail struct {
	Test    string `json:"test"`
	Reason  string `json:"reason"`
	Urgency string `json:"urgency"`
}

// ConditionScoreDetail is a ranked probable condition returned to the patient.
type ConditionScoreDetail struct {
	Condition   string `json:"condition"`
	Confidence  int    `json:"confidence"`
	Description string `json:"description"`
}

// rawAIResponse mirrors the JSON stored in ai_response and physician_ai_output.
type rawAIResponse struct {
	Diagnosis *struct {
		Confidence int `json:"confidence"`
	} `json:"diagnosis"`
	HPI            *HPIDetail             `json:"hpi"`
	Prescription   *PrescriptionDetail    `json:"prescription"`
	Prescriptions  []PrescriptionDetail   `json:"prescriptions"`
	Investigations []InvestigationDetail  `json:"investigations"`
	Conditions     []ConditionScoreDetail `json:"conditions"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetDiagnoses returns a paginated list of diagnoses for the authenticated patient.
func (s *Service) GetDiagnoses(userID string, page, pageSize int) ([]DiagnosisDetail, int, error) {
	offset := (page - 1) * pageSize

	rows, err := s.db.Query(`
		SELECT d.id, COALESCE(d.title,''), COALESCE(d.description,''),
		       COALESCE(d.condition,''), COALESCE(d.urgency,''),
		       d.status, d.escalated, d.has_prescription,
		       COALESCE(d.physician_decision,''), COALESCE(d.physician_notes,''),
		       COALESCE(TO_CHAR(d.follow_up_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
		       COALESCE(d.follow_up_instructions,''),
		       d.outcome_checked,
		       COALESCE(d.ai_response::text,'{}'),
		       COALESCE(d.physician_ai_output::text,''),
		       TO_CHAR(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), TO_CHAR(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(pu.name,''),
		       COALESCE(d.physician_health_tips,''),
		       COALESCE(d.hpi::text,'')
		FROM diagnoses d
		LEFT JOIN users pu ON pu.id = d.physician_id
		WHERE d.user_id = $1::uuid
		ORDER BY d.created_at DESC
		LIMIT $2 OFFSET $3`, userID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []DiagnosisDetail
	for rows.Next() {
		var d DiagnosisDetail
		var aiJSON, physicianAIJSON, hpiJSON string
		if err := rows.Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
			&d.Urgency, &d.Status, &d.Escalated, &d.HasPrescription,
			&d.PhysicianDecision, &d.PhysicianNotes,
			&d.FollowUpDate, &d.FollowUpInstructions, &d.OutcomeChecked,
			&aiJSON, &physicianAIJSON, &d.CreatedAt, &d.UpdatedAt, &d.PhysicianName,
			&d.PhysicianHealthTips, &hpiJSON); err != nil {
			log.Printf("diagnosis: scan row: %v", err)
			continue
		}
		enrichFromAI(&d, aiJSON, physicianAIJSON, hpiJSON)
		records = append(records, d)
	}

	var total int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM diagnoses WHERE user_id = $1::uuid`, userID).Scan(&total)

	return records, total, rows.Err()
}

// GetDiagnosisDetail returns a single diagnosis owned by the authenticated patient.
func (s *Service) GetDiagnosisDetail(userID, diagnosisID string) (*DiagnosisDetail, error) {
	var d DiagnosisDetail
	var aiJSON, physicianAIJSON, hpiJSON string
	err := s.db.QueryRow(`
		SELECT d.id, COALESCE(d.title,''), COALESCE(d.description,''),
		       COALESCE(d.condition,''), COALESCE(d.urgency,''),
		       d.status, d.escalated, d.has_prescription,
		       COALESCE(d.physician_decision,''), COALESCE(d.physician_notes,''),
		       COALESCE(TO_CHAR(d.follow_up_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
		       COALESCE(d.follow_up_instructions,''),
		       d.outcome_checked,
		       COALESCE(d.ai_response::text,'{}'),
		       COALESCE(d.physician_ai_output::text,''),
		       TO_CHAR(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), TO_CHAR(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(pu.name,''),
		       COALESCE(d.physician_health_tips,''),
		       COALESCE(d.hpi::text,'')
		FROM diagnoses d
		LEFT JOIN users pu ON pu.id = d.physician_id
		WHERE d.id = $1 AND d.user_id = $2::uuid`,
		diagnosisID, userID,
	).Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
		&d.Urgency, &d.Status, &d.Escalated, &d.HasPrescription,
		&d.PhysicianDecision, &d.PhysicianNotes,
		&d.FollowUpDate, &d.FollowUpInstructions, &d.OutcomeChecked,
		&aiJSON, &physicianAIJSON, &d.CreatedAt, &d.UpdatedAt, &d.PhysicianName,
		&d.PhysicianHealthTips, &hpiJSON)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	enrichFromAI(&d, aiJSON, physicianAIJSON, hpiJSON)
	return &d, nil
}

// enrichFromAI populates confidence, prescription, investigations, conditions
// and triage notes from the stored JSONB columns. physician_ai_output takes
// precedence field-by-field over ai_response when it is non-empty.
func enrichFromAI(d *DiagnosisDetail, aiJSON, physicianAIJSON, hpiJSON string) {
	// 1. Parse the base AI response.
	var base rawAIResponse
	if err := json.Unmarshal([]byte(aiJSON), &base); err == nil {
		if base.Diagnosis != nil {
			d.Confidence = base.Diagnosis.Confidence
		}
		d.Prescription = base.Prescription
		d.Investigations = base.Investigations
		d.Conditions = base.Conditions
		// HPI may be embedded inside ai_response (older records)
		if base.HPI != nil {
			d.TriageNotes = base.HPI
		}
	}

	// 2. Prefer HPI from the dedicated hpi column (newer records) — overrides any
	//    embedded value extracted from ai_response above.
	if hpiJSON != "" {
		var hpi HPIDetail
		if err := json.Unmarshal([]byte(hpiJSON), &hpi); err == nil {
			d.TriageNotes = &hpi
		}
	}

	// 2. Override with physician edits when present.
	if physicianAIJSON != "" {
		var override rawAIResponse
		if err := json.Unmarshal([]byte(physicianAIJSON), &override); err == nil {
			if override.Prescription != nil {
				d.Prescription = override.Prescription
			}
			if len(override.Prescriptions) > 0 {
				d.Prescriptions = override.Prescriptions
				// Keep singular field in sync for backward compat
				if d.Prescription == nil {
					d.Prescription = &override.Prescriptions[0]
				}
			}
			if len(override.Investigations) > 0 {
				d.Investigations = override.Investigations
			}
			if len(override.Conditions) > 0 {
				d.Conditions = override.Conditions
			}
		}
	}

	// Redact prescription from the API response unless the physician has
	// formally approved the case. This enforces the gate server-side so that
	// clients inspecting raw API traffic cannot read prescription data before
	// approval.
	isApproved := d.Status == "Completed" && d.PhysicianDecision == "Approved"
	if !isApproved {
		d.Prescription = nil
		d.Prescriptions = nil

		// Some legacy AI summaries may include treatment-like guidance in the
		// free-text description. Hide those hints until physician approval too.
		if d.HasPrescription && containsTreatmentGuidance(d.Description) {
			d.Description = "AI assessment recorded. Treatment recommendations will be visible after physician approval."
		}
	}
}

func containsTreatmentGuidance(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return false
	}

	markers := []string{
		"recommended treatment",
		"treatment plan",
		"prescription",
		"medication",
		"medicine",
		"dosage",
		"take ",
		"start ",
		"twice daily",
		"once daily",
		"for 7 days",
		"for 5 days",
	}

	for _, marker := range markers {
		if strings.Contains(lower, marker) {
			return true
		}
	}

	return false
}

// SubmitOutcome records the patient's self-reported follow-up outcome.
// If the outcome is "worse" or "same" the case is escalated and true is returned.
// Returns an error with message "not found" when the diagnosis does not belong to userID.
func (s *Service) SubmitOutcome(userID, diagnosisID, outcome string) (bool, error) {
	// Verify ownership first.
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM diagnoses WHERE id = $1 AND user_id = $2::uuid`,
		diagnosisID, userID,
	).Scan(&count)
	if err != nil || count == 0 {
		return false, fmt.Errorf("not found")
	}

	escalate := outcome == "worse" || outcome == "same"

	_, err = s.db.Exec(`
		UPDATE diagnoses
		SET outcome_checked = TRUE,
		    escalated       = CASE WHEN $2 THEN TRUE ELSE escalated END,
		    updated_at      = NOW()
		WHERE id = $1`,
		diagnosisID, escalate,
	)
	if err != nil {
		return false, err
	}
	return escalate, nil
}
