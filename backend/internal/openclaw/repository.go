package openclaw

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// caseNeedingReply is an Active case owned by an OpenClaw physician where the
// most recent IM message was sent by the patient — the AI must reply.
type caseNeedingReply struct {
	CaseID        string
	PhysicianID   string
	AgentSlug     string
	PatientID     string
	PatientName   string
	PatientGender string
	Language      string
	CaseTitle     string
	CaseDesc      string
	// EDIS outputs
	Condition    string
	Urgency      string
	HPI          string // raw JSONB text (may be empty)
	AIResponse   string // raw JSONB text (may be empty)
}

// completableCase is an Active OpenClaw case whose last IM is from the physician
// and where EDIS has already set a condition — ready to be auto-completed.
type completableCase struct {
	CaseID      string
	PhysicianID string
	PatientID   string
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

// ListCasesNeedingReply returns Active OpenClaw cases where the most recent
// instant message was sent by the patient (sender_role = 'user').
func (r *Repository) ListCasesNeedingReply(ctx context.Context, limit int) ([]caseNeedingReply, error) {
	const q = `
		SELECT
			d.id::text,
			d.physician_id::text,
			u_phys.openclaw_agent_slug,
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
		  AND u_phys.openclaw_agent_slug IS NOT NULL
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
			&c.CaseID, &c.PhysicianID, &c.AgentSlug,
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

// ListCompletableCases returns Active OpenClaw cases where:
//   - EDIS has set a condition (non-empty)
//   - The last IM message was sent by the physician (AI has already replied)
func (r *Repository) ListCompletableCases(ctx context.Context, limit int) ([]completableCase, error) {
	const q = `
		SELECT
			d.id::text,
			d.physician_id::text,
			d.user_id::text
		FROM diagnoses d
		JOIN users u_phys ON u_phys.id = d.physician_id
		WHERE d.status = 'Active'
		  AND u_phys.openclaw_agent_slug IS NOT NULL
		  AND d.condition IS NOT NULL AND d.condition <> ''
		  AND (
			SELECT sender_role
			FROM instant_messages im
			WHERE im.diagnosis_id = d.id
			ORDER BY im.created_at DESC
			LIMIT 1
		  ) = 'professional'
		ORDER BY d.physician_assigned_at ASC
		LIMIT $1`

	rows, err := r.db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cases []completableCase
	for rows.Next() {
		var c completableCase
		if err := rows.Scan(&c.CaseID, &c.PhysicianID, &c.PatientID); err != nil {
			return nil, err
		}
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

// CompleteCase transitions an Active case to Completed with an Approved decision.
// Returns (patientID, nil) on success, ("", nil) if the row was not found or
// already completed (idempotent), and ("", err) on a real DB error.
func (r *Repository) CompleteCase(ctx context.Context, caseID, physicianID string) (patientID string, err error) {
	const q = `
		UPDATE diagnoses
		SET    status             = 'Completed',
		       physician_decision = 'Approved',
		       updated_at         = NOW()
		WHERE  id           = $1::uuid
		  AND  physician_id = $2::uuid
		  AND  status       = 'Active'
		RETURNING user_id::text`

	err = r.db.QueryRowContext(ctx, q, caseID, physicianID).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil // already completed or not owned — safe to ignore
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

// InsertPhysicianMessage persists a physician IM reply for a case.
func (r *Repository) InsertPhysicianMessage(ctx context.Context, caseID, physicianID, physicianName, content string) error {
	const q = `
		INSERT INTO instant_messages (diagnosis_id, sender_id, sender_role, sender_name, content)
		VALUES ($1, $2::uuid, 'professional', $3, $4)`

	_, err := r.db.ExecContext(ctx, q, caseID, physicianID, physicianName, content)
	return err
}
