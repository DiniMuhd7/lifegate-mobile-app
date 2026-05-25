package engagement

import (
	"database/sql"
	"fmt"
	"time"
)

// AppSession represents one foreground app session for a user.
type AppSession struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	Role         string     `json:"role"`
	StartedAt    time.Time  `json:"startedAt"`
	EndedAt      *time.Time `json:"endedAt,omitempty"`
	DurationSecs *int       `json:"durationSecs,omitempty"`
}

// Repository handles app_sessions DB operations.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// StartSession inserts a new open session and returns its ID.
func (r *Repository) StartSession(userID, role string) (string, error) {
	var id string
	err := r.db.QueryRow(
		`INSERT INTO app_sessions (user_id, role) VALUES ($1, $2) RETURNING id`,
		userID, role,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("start app session: %w", err)
	}
	return id, nil
}

// EndSession closes a session by recording ended_at and duration_secs.
// Only the owner may end their session (userID guard).
func (r *Repository) EndSession(sessionID, userID string) error {
	res, err := r.db.Exec(`
		UPDATE app_sessions
		SET ended_at      = NOW(),
		    duration_secs = EXTRACT(EPOCH FROM (NOW() - started_at))::integer
		WHERE id = $1
		  AND user_id = $2
		  AND ended_at IS NULL`,
		sessionID, userID,
	)
	if err != nil {
		return fmt.Errorf("end app session: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("session not found or already ended")
	}
	return nil
}
