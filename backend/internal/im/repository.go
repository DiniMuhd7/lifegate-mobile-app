package im

import (
	"database/sql"
	"errors"
	"time"
)

// ErrNotFound is returned when a message or conversation cannot be located.
var ErrNotFound = errors.New("instant message not found")

// Message is a single IM entry persisted in instant_messages.
type Message struct {
	ID          string    `json:"id"`
	DiagnosisID string    `json:"diagnosis_id"`
	SenderID    string    `json:"sender_id"`
	SenderRole  string    `json:"sender_role"` // "user" | "professional"
	SenderName  string    `json:"sender_name"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"created_at"`
	ReadAt      *time.Time `json:"read_at"`
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
		RETURNING id, diagnosis_id, sender_id, sender_role, sender_name, content, created_at, read_at`

	msg := &Message{}
	err := r.db.QueryRow(q, diagnosisID, senderID, senderRole, senderName, content).
		Scan(&msg.ID, &msg.DiagnosisID, &msg.SenderID, &msg.SenderRole,
			&msg.SenderName, &msg.Content, &msg.CreatedAt, &msg.ReadAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

// ListByDiagnosis returns all messages for a diagnosis ordered oldest-first.
func (r *Repository) ListByDiagnosis(diagnosisID string) ([]Message, error) {
	const q = `
		SELECT id, diagnosis_id, sender_id, sender_role, sender_name, content, created_at, read_at
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
		if err := rows.Scan(&m.ID, &m.DiagnosisID, &m.SenderID, &m.SenderRole,
			&m.SenderName, &m.Content, &m.CreatedAt, &m.ReadAt); err != nil {
			return nil, err
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
