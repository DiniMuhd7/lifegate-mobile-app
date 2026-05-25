package openclaw

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
)

// caseNeedingReply is an Active case owned by an OpenClaw physician (or a human
// physician with AI mode enabled) where the most recent IM message was sent by
// the patient — the AI must reply.
type caseNeedingReply struct {
	CaseID        string
	PhysicianID   string
	AgentSlug     string
	PhysicianName string // actual display name (used when IsHumanAIMode=true)
	IsHumanAIMode bool   // true when the physician enabled AI mode rather than being a built-in agent
	PatientID     string
	PatientName   string
	PatientGender string
	Language      string
	CaseTitle     string
	CaseDesc      string
	// EDIS outputs
	Condition  string
	Urgency    string
	HPI        string // raw JSONB text (may be empty)
	AIResponse string // raw JSONB text (may be empty)
}

// caseForReview is an Active OpenClaw case (or a human AI mode physician case)
// whose last IM is from the physician (AI already replied) and where EDIS has
// set a condition — ready for the AI physician to perform a structured clinical review.
type caseForReview struct {
	CaseID        string
	PhysicianID   string
	AgentSlug     string
	PhysicianName string // actual display name (used when IsHumanAIMode=true)
	IsHumanAIMode bool   // true when the physician enabled AI mode
	PatientID     string
	PatientName   string
	// EDIS outputs
	Condition  string
	Urgency    string
	CaseTitle  string
	CaseDesc   string
	HPI        string // raw JSONB text (may be empty)
	AIResponse string // full ai_response JSONB text
	// Patient profile (used to check allergies, interactions, etc.)
	Allergies          string
	MedicalHistory     string
	CurrentMedications string
	BloodType          string
	Genotype           string
}

// reviewInput carries the AI physician's structured review decision.
type reviewInput struct {
	Notes                 string
	PhysicianDecision     string              // "Approved" | "Rejected"
	RejectionReason       string              // required when Rejected
	HealthTips            string              // short personalised health tip for the patient
	UpdatedCondition      string              // override top-level condition column; "" = keep EDIS value
	UpdatedUrgency        string              // override top-level urgency column; "" = keep EDIS value
	UpdatedPrescription   *ai.Prescription    // nil = accept EDIS as-is (single medication)
	UpdatedPrescriptions  []ai.Prescription   // multiple medications; takes precedence over UpdatedPrescription when non-empty
	UpdatedInvestigations []ai.Investigation  // nil = accept EDIS as-is
	UpdatedConditions     []ai.ConditionScore // nil = accept EDIS as-is
}

// physicianAIOutputDoc is the JSONB written to physician_ai_output when the AI
// physician overrides the EDIS recommendation.  Mirrors physician.PhysicianAIOutput.
type physicianAIOutputDoc struct {
	Prescription   *ai.Prescription    `json:"prescription,omitempty"`
	Prescriptions  []ai.Prescription   `json:"prescriptions,omitempty"`
	Investigations []ai.Investigation  `json:"investigations,omitempty"`
	Conditions     []ai.ConditionScore `json:"conditions,omitempty"`
}

// imMessage is a single row from instant_messages used to reconstruct history.
type imMessage struct {
	SenderRole string
	SenderName string
	Content    string
	CreatedAt  time.Time
}

// Repository handles the DB queries specific to the OpenClaw worker.
type Repository struct {
	db *sql.DB
}

// NewRepository returns a Repository backed by db.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListCasesNeedingReply returns Active cases where the most recent instant
// message was sent by the patient (sender_role = 'user').  Includes both:
//   - Built-in OpenClaw AI physicians (openclaw_agent_slug IS NOT NULL), and
//   - Human physicians who have enabled AI mode (ai_mode_enabled = TRUE).
func (r *Repository) ListCasesNeedingReply(ctx context.Context, limit int) ([]caseNeedingReply, error) {
	const q = `
		SELECT
			d.id::text,
			d.physician_id::text,
			COALESCE(u_phys.openclaw_agent_slug, ''),
			COALESCE(u_phys.name, ''),
			u_phys.ai_mode_enabled,
			d.user_id::text,
			COALESCE(u_pat.name, ''),
			COALESCE(u_pat.gender, ''),
			COALESCE(u_pat.language, ''),
			COALESCE(d.title, ''),
			COALESCE(d.description, ''),
			COALESCE(d.condition, ''),
			COALESCE(d.urgency, ''),
			COALESCE(d.hpi::text, ''),
			COALESCE(d.ai_response::text, '')
		FROM diagnoses d
		JOIN users u_phys ON u_phys.id = d.physician_id
		JOIN users u_pat  ON u_pat.id  = d.user_id
		WHERE d.status = 'Active'
		  AND (u_phys.openclaw_agent_slug IS NOT NULL OR u_phys.ai_mode_enabled = TRUE)
		  AND (
			SELECT sender_role
			FROM instant_messages im
			WHERE im.diagnosis_id = d.id
			ORDER BY im.created_at DESC
			LIMIT 1
		  ) = 'user'
		ORDER BY d.physician_assigned_at ASC
		LIMIT $1`

	rows, err := r.db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cases []caseNeedingReply
	for rows.Next() {
		var c caseNeedingReply
		if err := rows.Scan(
			&c.CaseID, &c.PhysicianID, &c.AgentSlug, &c.PhysicianName, &c.IsHumanAIMode,
			&c.PatientID, &c.PatientName, &c.PatientGender, &c.Language,
			&c.CaseTitle, &c.CaseDesc,
			&c.Condition, &c.Urgency,
			&c.HPI, &c.AIResponse,
		); err != nil {
			return nil, err
		}
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

// ListCasesReadyForReview returns Active OpenClaw cases where:
//   - EDIS has set a condition (non-empty)
//   - The last IM message was sent by the physician (AI has already replied)
//
// It returns the full EDIS AI response and patient profile so the review
// system prompt can be built without an additional DB round-trip.
func (r *Repository) ListCasesReadyForReview(ctx context.Context, limit int) ([]caseForReview, error) {
	const q = `
		SELECT
			d.id::text,
			d.physician_id::text,
			COALESCE(u_phys.openclaw_agent_slug, ''),
			COALESCE(u_phys.name, ''),
			u_phys.ai_mode_enabled,
			d.user_id::text,
			COALESCE(u_pat.name, ''),
			COALESCE(d.condition, ''),
			COALESCE(d.urgency, ''),
			COALESCE(d.title, ''),
			COALESCE(d.description, ''),
			COALESCE(d.hpi::text, ''),
			COALESCE(d.ai_response::text, '{}'),
			COALESCE(u_pat.allergies, ''),
			COALESCE(u_pat.medical_history, ''),
			COALESCE(u_pat.current_medications, ''),
			COALESCE(u_pat.blood_type, ''),
			COALESCE(u_pat.genotype, '')
		FROM diagnoses d
		JOIN users u_phys ON u_phys.id = d.physician_id
		JOIN users u_pat  ON u_pat.id  = d.user_id
		WHERE d.status = 'Active'
		  AND (u_phys.openclaw_agent_slug IS NOT NULL OR u_phys.ai_mode_enabled = TRUE)
		  AND d.condition IS NOT NULL AND d.condition <> ''
		  AND (
			SELECT sender_role
			FROM instant_messages im
			WHERE im.diagnosis_id = d.id
			ORDER BY im.created_at DESC
			LIMIT 1
		  ) = 'professional'
		  -- Require at least one patient message to prevent premature completion
		  -- caused by the auto-assign initial greeting (sender_role='professional')
		  -- being the first and only message in the conversation.
		  AND EXISTS (
			SELECT 1 FROM instant_messages im2
			WHERE im2.diagnosis_id = d.id
			  AND im2.sender_role = 'user'
		  )
		ORDER BY d.physician_assigned_at ASC
		LIMIT $1`

	rows, err := r.db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cases []caseForReview
	for rows.Next() {
		var c caseForReview
		if err := rows.Scan(
			&c.CaseID, &c.PhysicianID, &c.AgentSlug, &c.PhysicianName, &c.IsHumanAIMode,
			&c.PatientID, &c.PatientName,
			&c.Condition, &c.Urgency,
			&c.CaseTitle, &c.CaseDesc,
			&c.HPI, &c.AIResponse,
			&c.Allergies, &c.MedicalHistory, &c.CurrentMedications,
			&c.BloodType, &c.Genotype,
		); err != nil {
			return nil, err
		}
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

// ReviewCase transitions an Active case to Completed using the AI physician's
// structured review decision.  It mirrors the exact SQL used by
// physician.Repository.ReviewReport for the "Completed" transition, ensuring
// identical behaviour to the physician case review screen.
//
// Returns (patientID, nil) on success, ("", nil) if the case was not found or
// already completed (idempotent), and ("", err) on a real DB error.
func (r *Repository) ReviewCase(ctx context.Context, caseID, physicianID string, input reviewInput) (patientID string, err error) {
	// Build physician_ai_output JSON when the AI provided any overrides.
	var aiOutArg interface{}
	hasOverrides := input.UpdatedPrescription != nil ||
		len(input.UpdatedPrescriptions) > 0 ||
		len(input.UpdatedInvestigations) > 0 ||
		len(input.UpdatedConditions) > 0
	if hasOverrides {
		out := physicianAIOutputDoc{
			Prescription:   input.UpdatedPrescription,
			Prescriptions:  input.UpdatedPrescriptions,
			Investigations: input.UpdatedInvestigations,
			Conditions:     input.UpdatedConditions,
		}
		// When multiple prescriptions are provided, keep the singular field in
		// sync for backward compatibility (mirrors physician.PhysicianAIOutput).
		if len(input.UpdatedPrescriptions) > 0 && out.Prescription == nil {
			out.Prescription = &input.UpdatedPrescriptions[0]
		}
		b, _ := json.Marshal(out)
		aiOutArg = string(b)
	}

	// physician_notes, physician_health_tips: only overwritten when non-empty.
	// physician_ai_output: only overwritten when overrides are present.
	// condition, urgency: only overwritten when the AI explicitly provides a new value.
	const q = `
		UPDATE diagnoses
		SET physician_notes       = CASE WHEN $2 <> '' THEN $2 ELSE physician_notes END,
		    status                = 'Completed',
		    physician_decision    = $3,
		    rejection_reason      = $4,
		    physician_ai_output   = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE physician_ai_output END,
		    physician_health_tips = CASE WHEN $7 <> '' THEN $7 ELSE physician_health_tips END,
		    condition             = CASE WHEN $8 <> '' THEN $8 ELSE condition END,
		    urgency               = CASE WHEN $9 <> '' THEN $9 ELSE urgency END,
		    updated_at            = NOW()
		WHERE id           = $1::uuid
		  AND physician_id = $6::uuid
		  AND status       = 'Active'
		RETURNING user_id::text`

	err = r.db.QueryRowContext(ctx, q,
		caseID,
		input.Notes,
		input.PhysicianDecision,
		input.RejectionReason,
		aiOutArg,
		physicianID,
		input.HealthTips,
		input.UpdatedCondition,
		input.UpdatedUrgency,
	).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil // already completed or not owned — idempotent
	}
	return patientID, err
}

// GetConversationHistory returns all IM messages for a case, oldest first.
func (r *Repository) GetConversationHistory(ctx context.Context, diagnosisID string) ([]imMessage, error) {
	const q = `
		SELECT sender_role, sender_name, content, created_at
		FROM   instant_messages
		WHERE  diagnosis_id = $1
		ORDER  BY created_at ASC`

	rows, err := r.db.QueryContext(ctx, q, diagnosisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []imMessage
	for rows.Next() {
		var m imMessage
		if err := rows.Scan(&m.SenderRole, &m.SenderName, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// InsertPhysicianMessage persists a physician IM reply for a case and returns
// the UUID of the newly created message.
func (r *Repository) InsertPhysicianMessage(ctx context.Context, caseID, physicianID, physicianName, content string) (string, error) {
	const q = `
		INSERT INTO instant_messages (diagnosis_id, sender_id, sender_role, sender_name, content)
		VALUES ($1, $2::uuid, 'professional', $3, $4)
		RETURNING id::text`

	var msgID string
	err := r.db.QueryRowContext(ctx, q, caseID, physicianID, physicianName, content).Scan(&msgID)
	return msgID, err
}
