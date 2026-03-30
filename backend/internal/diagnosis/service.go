package diagnosis

import (
	"database/sql"
	"encoding/json"
	"log"
)

// DiagnosisDetail is the full patient-facing diagnosis record returned from the API.
type DiagnosisDetail struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Description    string  `json:"description"`
	Condition      string  `json:"condition"`
	Urgency        string  `json:"urgency"`
	Confidence     int     `json:"confidence"`
	Status         string  `json:"status"`
	Escalated      bool    `json:"escalated"`
	PhysicianNotes string  `json:"physicianNotes,omitempty"`
	Prescription   *PrescriptionDetail `json:"prescription,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// PrescriptionDetail is the prescription extracted from the AI response JSON.
type PrescriptionDetail struct {
	Medicine     string `json:"medicine"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Instructions string `json:"instructions,omitempty"`
}

// rawAIResponse mirrors the JSON stored in the ai_response JSONB column.
type rawAIResponse struct {
	Diagnosis *struct {
		Confidence int `json:"confidence"`
	} `json:"diagnosis"`
	Prescription *PrescriptionDetail `json:"prescription"`
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
		       status, escalated, COALESCE(physician_notes,''),
		       COALESCE(ai_response::text,'{}'),
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
		var aiJSON string
		if err := rows.Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
			&d.Urgency, &d.Status, &d.Escalated, &d.PhysicianNotes,
			&aiJSON, &d.CreatedAt, &d.UpdatedAt); err != nil {
			log.Printf("diagnosis: scan row: %v", err)
			continue
		}
		enrichFromAI(&d, aiJSON)
		records = append(records, d)
	}

	var total int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM diagnoses WHERE user_id = $1::uuid`, userID).Scan(&total)

	return records, total, rows.Err()
}

// GetDiagnosisDetail returns a single diagnosis owned by the authenticated patient.
func (s *Service) GetDiagnosisDetail(userID, diagnosisID string) (*DiagnosisDetail, error) {
	var d DiagnosisDetail
	var aiJSON string
	err := s.db.QueryRow(`
		SELECT id, COALESCE(title,''), COALESCE(description,''),
		       COALESCE(condition,''), COALESCE(urgency,''),
		       status, escalated, COALESCE(physician_notes,''),
		       COALESCE(ai_response::text,'{}'),
		       created_at::text, updated_at::text
		FROM diagnoses
		WHERE id = $1 AND user_id = $2::uuid`,
		diagnosisID, userID,
	).Scan(&d.ID, &d.Title, &d.Description, &d.Condition,
		&d.Urgency, &d.Status, &d.Escalated, &d.PhysicianNotes,
		&aiJSON, &d.CreatedAt, &d.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	enrichFromAI(&d, aiJSON)
	return &d, nil
}

// enrichFromAI populates confidence and prescription from the stored ai_response JSON.
func enrichFromAI(d *DiagnosisDetail, aiJSON string) {
	var raw rawAIResponse
	if err := json.Unmarshal([]byte(aiJSON), &raw); err != nil {
		return
	}
	if raw.Diagnosis != nil {
		d.Confidence = raw.Diagnosis.Confidence
	}
	if raw.Prescription != nil {
		d.Prescription = raw.Prescription
	}
}
