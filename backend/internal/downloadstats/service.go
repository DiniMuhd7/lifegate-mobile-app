package downloadstats

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Service stores and retrieves public download-page metrics.
type Service struct {
	db *sql.DB
}

// NewService returns a download stats service.
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetStats returns the current aggregated metrics.
func (s *Service) GetStats(ctx context.Context) (Stats, error) {
	if err := s.ensureRow(ctx); err != nil {
		return Stats{}, err
	}

	var (
		out       Stats
		updatedAt time.Time
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT page_views, android_clicks, ios_clicks, updated_at
		FROM download_page_stats
		WHERE id = 1`).Scan(
		&out.PageViews,
		&out.AndroidClicks,
		&out.IOSClicks,
		&updatedAt,
	)
	if err != nil {
		return Stats{}, err
	}
	out.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return out, nil
}

// TrackEvent increments one metric counter and returns the latest snapshot.
func (s *Service) TrackEvent(ctx context.Context, event string) (Stats, error) {
	if event != EventView && event != EventAndroidDownload && event != EventIOSDownload {
		return Stats{}, errors.New("invalid event type")
	}
	if err := s.ensureRow(ctx); err != nil {
		return Stats{}, err
	}

	var (
		out       Stats
		updatedAt time.Time
	)
	err := s.db.QueryRowContext(ctx, `
		UPDATE download_page_stats
		SET
			page_views = page_views + CASE WHEN $1 = 'view' THEN 1 ELSE 0 END,
			android_clicks = android_clicks + CASE WHEN $1 = 'android_download' THEN 1 ELSE 0 END,
			ios_clicks = ios_clicks + CASE WHEN $1 = 'ios_download' THEN 1 ELSE 0 END,
			updated_at = NOW()
		WHERE id = 1
		RETURNING page_views, android_clicks, ios_clicks, updated_at`,
		event,
	).Scan(&out.PageViews, &out.AndroidClicks, &out.IOSClicks, &updatedAt)
	if err != nil {
		return Stats{}, err
	}
	out.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return out, nil
}

func (s *Service) ensureRow(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_page_stats (id, page_views, android_clicks, ios_clicks, updated_at)
		VALUES (1, 527000, 255000, 272000, NOW())
		ON CONFLICT (id) DO NOTHING`)
	return err
}
