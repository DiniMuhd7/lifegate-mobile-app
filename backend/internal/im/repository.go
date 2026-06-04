package im

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// ErrNotFound is returned when a message or conversation cannot be located.
var ErrNotFound = errors.New("instant message not found")

// Message is a single IM entry persisted in instant_messages.
type Message struct {
	ID          string          `json:"id"`
	DiagnosisID string          `json:"diagnosis_id"`
	SenderID    string          `json:"sender_id"`
	SenderRole  string          `json:"sender_role"` // "user" | "professional"
	SenderName  string          `json:"sender_name"`
	Content     string          `json:"content"`
	CreatedAt   time.Time       `json:"created_at"`
	ReadAt      *time.Time      `json:"read_at"`
	// Metadata carries optional structured data (e.g. call-transcript payload).
	// Stored as JSONB in the database; nil when not set.
	Metadata    json.RawMessage `json:"metadata,omitempty"`
}

// Repository handles persistence for instant messages.
type Repository struct {
	db *sql.DB
}

// NewRepository constructs a Repository backed by the given *sql.DB.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts a new message and returns the full saved record.
func (r *Repository) Create(diagnosisID, senderID, senderRole, senderName, content string) (*Message, error) {
	const q = `
		INSERT INTO instant_messages (diagnosis_id, sender_id, sender_role, sender_name, content)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, diagnosis_id, sender_id, sender_role, sender_name, content, created_at, read_at, metadata`

	msg := &Message{}
	var meta []byte
	err := r.db.QueryRow(q, diagnosisID, senderID, senderRole, senderName, content).
		Scan(&msg.ID, &msg.DiagnosisID, &msg.SenderID, &msg.SenderRole,
			&msg.SenderName, &msg.Content, &msg.CreatedAt, &msg.ReadAt, &meta)
	if err != nil {
		return nil, err
	}
	if meta != nil {
		msg.Metadata = json.RawMessage(meta)
	}
	return msg, nil
}

// ListByDiagnosis returns all messages for a diagnosis ordered oldest-first.
func (r *Repository) ListByDiagnosis(diagnosisID string) ([]Message, error) {
	const q = `
		SELECT id, diagnosis_id, sender_id, sender_role, sender_name, content, created_at, read_at, metadata
		FROM   instant_messages
		WHERE  diagnosis_id = $1
		ORDER  BY created_at ASC`

	rows, err := r.db.Query(q, diagnosisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		var meta []byte
		if err := rows.Scan(&m.ID, &m.DiagnosisID, &m.SenderID, &m.SenderRole,
			&m.SenderName, &m.Content, &m.CreatedAt, &m.ReadAt, &meta); err != nil {
			return nil, err
		}
		if meta != nil {
			m.Metadata = json.RawMessage(meta)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// MarkRead stamps read_at = NOW() on all messages in a conversation that were
// sent by *another* role (i.e. the reader is marking the opposite side's messages
// as read). The callerRole identifies which role is doing the reading.
func (r *Repository) MarkRead(diagnosisID, callerRole string) error {
	const q = `
		UPDATE instant_messages
		SET    read_at = NOW()
		WHERE  diagnosis_id = $1
		  AND  sender_role <> $2
		  AND  read_at IS NULL`

	_, err := r.db.Exec(q, diagnosisID, callerRole)
	return err
}

// UnreadCount returns the number of unread messages sent TO the given role
// (i.e. messages sent by the opposite role that have not been read yet).
func (r *Repository) UnreadCount(diagnosisID, callerRole string) (int, error) {
	const q = `
		SELECT COUNT(*)
		FROM   instant_messages
		WHERE  diagnosis_id = $1
		  AND  sender_role <> $2
		  AND  read_at IS NULL`

	var n int
	err := r.db.QueryRow(q, diagnosisID, callerRole).Scan(&n)
	return n, err
}

// GetParticipants returns the patient userID and physician userID for a
// diagnosis directly from the diagnoses table — reliable even when no messages
// have been exchanged yet. Returns empty strings (no error) when the row is
// not found.
func (r *Repository) GetParticipants(diagnosisID string) (patientID, physicianID string, err error) {
	const q = `SELECT COALESCE(user_id::text,''), COALESCE(physician_id::text,'')
	           FROM diagnoses WHERE id = $1`
	err = r.db.QueryRow(q, diagnosisID).Scan(&patientID, &physicianID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return patientID, physicianID, err
}

// GetCaseCompletion returns the status and updated_at timestamp for a diagnosis.
// Returns ("", zero, nil) when the row is not found.
func (r *Repository) GetCaseCompletion(diagnosisID string) (status string, updatedAt time.Time, err error) {
	const q = `SELECT status, updated_at FROM diagnoses WHERE id = $1`
	err = r.db.QueryRow(q, diagnosisID).Scan(&status, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", time.Time{}, nil
	}
	return status, updatedAt, err
}
