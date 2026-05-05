package healthmetrics

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Service stores and retrieves health metric snapshots.
type Service struct {
	db *sql.DB
}

// NewService returns a Service backed by db.
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// Sync inserts a new snapshot row for the patient.
func (s *Service) Sync(ctx context.Context, userID string, req SyncRequest) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO health_metrics
		    (user_id, recorded_at, steps_today, active_minutes, distance_meters, calories)
		VALUES ($1, NOW(), $2, $3, $4, $5)`,
		userID,
		req.StepsToday,
		req.ActiveMinutes,
		fmt.Sprintf("%.2f", req.DistanceMeters),
		fmt.Sprintf("%.2f", req.Calories),
	)
	return err
}

// Today returns the most recent snapshot uploaded today (local UTC day) for
// the given patient. Returns a zero-value summary when no row exists yet.
func (s *Service) Today(ctx context.Context, userID string) (TodaySummary, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT steps_today, active_minutes, distance_meters, calories, recorded_at
		FROM   health_metrics
		WHERE  user_id = $1::uuid
		  AND  recorded_at >= CURRENT_DATE
		ORDER  BY recorded_at DESC
		LIMIT  1`,
		userID,
	)

	var (
		steps     int
		active    int
		dist      float64
		cal       float64
		recordedAt time.Time
	)
	err := row.Scan(&steps, &active, &dist, &cal, &recordedAt)
	if err == sql.ErrNoRows {
		return TodaySummary{}, nil
	}
	if err != nil {
		return TodaySummary{}, err
	}
	return TodaySummary{
		StepsToday:     steps,
		ActiveMinutes:  active,
		DistanceMeters: dist,
		Calories:       cal,
		LastSyncAt:     recordedAt.UTC().Format(time.RFC3339),
	}, nil
}
