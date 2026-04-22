package diagnosis

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

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
	PhysicianDecision    string               `json:"physicianDecision,omitempty"`
	PhysicianNotes       string               `json:"physicianNotes,omitempty"`
	FollowUpDate         string               `json:"followUpDate,omitempty"`
	FollowUpInstructions string               `json:"followUpInstructions,omitempty"`
	OutcomeChecked       bool                 `json:"outcomeChecked"`
	Prescription         *PrescriptionDetail  `json:"prescription,omitempty"`
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
	Prescription   *PrescriptionDetail    `json:"prescription"`
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
		SELECT id, COALESCE(title,''), COALESCE(description,''),
		       COALESCE(condition,''), COALESCE(urgency,''),
		       status, escalated, has_prescription,
		       COALESCE(physician_decision,''), COALESCE(physician_notes,''),
		       COALESCE(TO_CHAR(follow_up_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
		       COALESCE(follow_up_instructions,''),
		       outcome_checked,
		       COALESCE(ai_response::text,'{}'),
		       COALESCE(physician_ai_output::text,''),
		       created_at::text, updated_at::text
		FROM diagnoses
		WHERE user_id = $1::uuid
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`, userID, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []DiagnosisDetail
	for rows.Next() {
		var d DiagnosisDetail
		var aiJSON, physicianAIJSON string
		if err := rows.Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
			&d.Urgency, &d.Status, &d.Escalated, &d.HasPrescription,
			&d.PhysicianDecision, &d.PhysicianNotes,
			&d.FollowUpDate, &d.FollowUpInstructions, &d.OutcomeChecked,
			&aiJSON, &physicianAIJSON, &d.CreatedAt, &d.UpdatedAt); err != nil {
			log.Printf("diagnosis: scan row: %v", err)
			continue
		}
		enrichFromAI(&d, aiJSON, physicianAIJSON)
		records = append(records, d)
	}

	var total int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM diagnoses WHERE user_id = $1::uuid`, userID).Scan(&total)

	return records, total, rows.Err()
}

// GetDiagnosisDetail returns a single diagnosis owned by the authenticated patient.
func (s *Service) GetDiagnosisDetail(userID, diagnosisID string) (*DiagnosisDetail, error) {
	var d DiagnosisDetail
	var aiJSON, physicianAIJSON string
	err := s.db.QueryRow(`
		SELECT id, COALESCE(title,''), COALESCE(description,''),
		       COALESCE(condition,''), COALESCE(urgency,''),
		       status, escalated, has_prescription,
		       COALESCE(physician_decision,''), COALESCE(physician_notes,''),
		       COALESCE(TO_CHAR(follow_up_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
		       COALESCE(follow_up_instructions,''),
		       outcome_checked,
		       COALESCE(ai_response::text,'{}'),
		       COALESCE(physician_ai_output::text,''),
		       created_at::text, updated_at::text
		FROM diagnoses
		WHERE id = $1 AND user_id = $2::uuid`,
		diagnosisID, userID,
	).Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
		&d.Urgency, &d.Status, &d.Escalated, &d.HasPrescription,
		&d.PhysicianDecision, &d.PhysicianNotes,
		&d.FollowUpDate, &d.FollowUpInstructions, &d.OutcomeChecked,
		&aiJSON, &physicianAIJSON, &d.CreatedAt, &d.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	enrichFromAI(&d, aiJSON, physicianAIJSON)
	return &d, nil
}

// enrichFromAI populates confidence, prescription, investigations and conditions
// from the stored JSONB columns. physician_ai_output takes precedence field-by-field
// over ai_response when it is non-empty.
func enrichFromAI(d *DiagnosisDetail, aiJSON, physicianAIJSON string) {
	// 1. Parse the base AI response.
	var base rawAIResponse
	if err := json.Unmarshal([]byte(aiJSON), &base); err == nil {
		if base.Diagnosis != nil {
			d.Confidence = base.Diagnosis.Confidence
		}
		d.Prescription = base.Prescription
		d.Investigations = base.Investigations
		d.Conditions = base.Conditions
	}

	// 2. Override with physician edits when present.
	if physicianAIJSON != "" {
		var override rawAIResponse
		if err := json.Unmarshal([]byte(physicianAIJSON), &override); err == nil {
			if override.Prescription != nil {
				d.Prescription = override.Prescription
			}
			if len(override.Investigations) > 0 {
				d.Investigations = override.Investigations
			}
			if len(override.Conditions) > 0 {
				d.Conditions = override.Conditions
			}
		}
	}
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
