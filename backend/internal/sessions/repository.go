package sessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// ErrNotFound is returned when a session does not exist or does not belong to the requesting user.
var ErrNotFound = errors.New("session not found")

// Session represents a server-side persisted chat session.
type Session struct {
	ID        string          `json:"id"`
	UserID    string          `json:"userId"`
	Title     string          `json:"title"`
	Category  string          `json:"category"`
	Mode      string          `json:"mode"`
	Status    string          `json:"status"` // active | completed | abandoned
	Messages  json.RawMessage `json:"messages"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// UpdateInput holds the optional fields that can be patched on an existing session.
// A nil pointer means "leave as-is"; an empty Messages slice means "leave as-is".
type UpdateInput struct {
	Title    *string
	Category *string
	Mode     *string
	Status   *string
	Messages json.RawMessage
}

// Repository handles all chat_sessions DB operations.
type Repository struct {
	db *sql.DB
}

// NewRepository creates a new Repository.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts a new session and returns the created record.
func (r *Repository) Create(ctx context.Context, userID, title, category, mode string, messages json.RawMessage) (*Session, error) {
	if len(messages) == 0 {
		messages = json.RawMessage("[]")
	}
	var s Session
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO chat_sessions (user_id, title, category, mode, status, messages)
		 VALUES ($1, $2, $3, $4, 'active', $5)
		 RETURNING id, user_id,
		           COALESCE(title,''), COALESCE(category,''), COALESCE(mode,''),
		           status, messages, created_at, updated_at`,
		userID, nilIfEmpty(title), nilIfEmpty(category), nilIfEmpty(mode), []byte(messages),
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Category, &s.Mode,
		&s.Status, &s.Messages, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// List returns all sessions for a user, newest first.
func (r *Repository) List(ctx context.Context, userID string) ([]Session, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id,
		        COALESCE(title,''), COALESCE(category,''), COALESCE(mode,''),
		        status, messages, created_at, updated_at
		 FROM chat_sessions
		 WHERE user_id = $1
		 ORDER BY updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &s.Category, &s.Mode,
			&s.Status, &s.Messages, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

// Get fetches a single session by ID, scoped to the owning user.
func (r *Repository) Get(ctx context.Context, id, userID string) (*Session, error) {
	var s Session
	err := r.db.QueryRowContext(ctx,
		`SELECT id, user_id,
		        COALESCE(title,''), COALESCE(category,''), COALESCE(mode,''),
		        status, messages, created_at, updated_at
		 FROM chat_sessions
		 WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Category, &s.Mode,
		&s.Status, &s.Messages, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Update patches the specified fields on a session, leaving unset fields unchanged.
func (r *Repository) Update(ctx context.Context, id, userID string, in UpdateInput) (*Session, error) {
	// Pass nil for messages when not provided so COALESCE keeps the existing value.
	var msgsArg interface{}
	if len(in.Messages) > 0 {
		msgsArg = []byte(in.Messages)
	}

	var s Session
	err := r.db.QueryRowContext(ctx,
		`UPDATE chat_sessions SET
		    title      = COALESCE($3, title),
		    category   = COALESCE($4, category),
		    mode       = COALESCE($5, mode),
		    status     = COALESCE($6, status),
		    messages   = COALESCE($7::jsonb, messages),
		    updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id,
		           COALESCE(title,''), COALESCE(category,''), COALESCE(mode,''),
		           status, messages, created_at, updated_at`,
		id, userID,
		in.Title, in.Category, in.Mode, in.Status, msgsArg,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Category, &s.Mode,
		&s.Status, &s.Messages, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Delete removes a session that belongs to the given user.
func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetIncomplete fetches the most-recently-updated abandoned session for a user.
// Returns (nil, nil) when no abandoned session exists — this is not an error.
func (r *Repository) GetIncomplete(ctx context.Context, userID string) (*Session, error) {
	var s Session
	err := r.db.QueryRowContext(ctx,
		`SELECT id, user_id,
		        COALESCE(title,''), COALESCE(category,''), COALESCE(mode,''),
		        status, messages, created_at, updated_at
		 FROM chat_sessions
		 WHERE user_id = $1 AND status = 'abandoned'
		 ORDER BY updated_at DESC
		 LIMIT 1`,
		userID,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Category, &s.Mode,
		&s.Status, &s.Messages, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil // no incomplete session — not an error
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// nilIfEmpty converts an empty string to nil for nullable DB columns.
func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
