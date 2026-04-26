package explore

import (
	"database/sql"
	"time"
)

// Video is a health education video record stored in the DB.
type Video struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Category        string `json:"category"`
	DurationSeconds int    `json:"durationSeconds"`
	Coins           int    `json:"coins"`
	ThumbnailColor  string `json:"thumbnailColor"`
	ThumbnailIcon   string `json:"thumbnailIcon"`
	Instructor      string `json:"instructor"`
	YoutubeID       string `json:"youtubeId"`
}

// Reward is a per-user per-day reward record.
type Reward struct {
	VideoID    string    `json:"videoId"`
	RewardedOn string    `json:"rewardedOn"` // YYYY-MM-DD
	CoinsEarned int      `json:"coinsEarned"`
	CreatedAt  time.Time `json:"createdAt"`
}

// Repository handles all DB queries for the explore feature.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListActiveVideos returns active videos ordered by sort_order.
// Passing a non-empty category restricts results to that category only.
func (r *Repository) ListActiveVideos(category string) ([]Video, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if category != "" {
		rows, err = r.db.Query(`
			SELECT id, title, description, category, duration_seconds, coins,
			       thumbnail_color, thumbnail_icon, instructor, youtube_id
			FROM   explore_videos
			WHERE  is_active = TRUE AND category = $1
			ORDER  BY sort_order ASC, created_at ASC
		`, category)
	} else {
		rows, err = r.db.Query(`
			SELECT id, title, description, category, duration_seconds, coins,
			       thumbnail_color, thumbnail_icon, instructor, youtube_id
			FROM   explore_videos
			WHERE  is_active = TRUE
			ORDER  BY sort_order ASC, created_at ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []Video
	for rows.Next() {
		var v Video
		if err := rows.Scan(
			&v.ID, &v.Title, &v.Description, &v.Category,
			&v.DurationSeconds, &v.Coins,
			&v.ThumbnailColor, &v.ThumbnailIcon,
			&v.Instructor, &v.YoutubeID,
		); err != nil {
			return nil, err
		}
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

// GetDailyRewardedIDs returns the set of video IDs already claimed by the user today.
func (r *Repository) GetDailyRewardedIDs(userID string) ([]string, error) {
	today := time.Now().Format("2006-01-02")
	rows, err := r.db.Query(`
		SELECT video_id FROM explore_video_rewards
		WHERE  user_id = $1 AND rewarded_on = $2
	`, userID, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ClaimReward records a reward for a user watching a video today.
// Returns (coinsEarned, alreadyClaimed, capReached, error).
func (r *Repository) ClaimReward(userID, videoID string, dailyCap int) (int, bool, bool, error) {
	today := time.Now().Format("2006-01-02")

	// Already claimed today?
	var exists bool
	err := r.db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM explore_video_rewards
			WHERE user_id=$1 AND video_id=$2 AND rewarded_on=$3
		)
	`, userID, videoID, today).Scan(&exists)
	if err != nil {
		return 0, false, false, err
	}
	if exists {
		return 0, true, false, nil
	}

	// Daily cap check
	var dailyCount int
	err = r.db.QueryRow(`
		SELECT COUNT(*) FROM explore_video_rewards
		WHERE user_id=$1 AND rewarded_on=$2
	`, userID, today).Scan(&dailyCount)
	if err != nil {
		return 0, false, false, err
	}
	if dailyCount >= dailyCap {
		return 0, false, true, nil
	}

	// Look up video coins
	var coins int
	err = r.db.QueryRow(`SELECT coins FROM explore_videos WHERE id=$1`, videoID).Scan(&coins)
	if err == sql.ErrNoRows {
		// Video not in the backend catalogue (e.g. frontend fetched directly
		// from YouTube). Return the sentinel so the handler can 404 and the
		// mobile client falls back to its offline reward path.
		return 0, false, false, sql.ErrNoRows
	}
	if err != nil {
		return 0, false, false, err
	}

	// Insert reward row
	_, err = r.db.Exec(`
		INSERT INTO explore_video_rewards (user_id, video_id, rewarded_on, coins_earned)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, video_id, rewarded_on) DO NOTHING
	`, userID, videoID, today, coins)
	if err != nil {
		return 0, false, false, err
	}

	return coins, false, false, nil
}

// UpsertVideo inserts a new video or updates it if the youtube_id already
// exists. This is called by the daily refresher.
func (r *Repository) UpsertVideo(v Video, sortOrder int) error {
	_, err := r.db.Exec(`
		INSERT INTO explore_videos
			(id, title, description, category, duration_seconds, coins,
			 thumbnail_color, thumbnail_icon, instructor, youtube_id,
			 is_active, sort_order)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)
		ON CONFLICT (id) DO UPDATE SET
			title            = EXCLUDED.title,
			description      = EXCLUDED.description,
			duration_seconds = EXCLUDED.duration_seconds,
			coins            = EXCLUDED.coins,
			thumbnail_color  = EXCLUDED.thumbnail_color,
			thumbnail_icon   = EXCLUDED.thumbnail_icon,
			instructor       = EXCLUDED.instructor,
			youtube_id       = EXCLUDED.youtube_id,
			is_active        = TRUE,
			sort_order       = EXCLUDED.sort_order,
			updated_at       = NOW()
	`,
		v.ID, v.Title, v.Description, v.Category,
		v.DurationSeconds, v.Coins,
		v.ThumbnailColor, v.ThumbnailIcon,
		v.Instructor, v.YoutubeID,
		sortOrder,
	)
	return err
}

// DeactivateOldVideos marks all videos in a category that were NOT refreshed
// today as inactive. Videos are identified by the "yt_" prefix added by the
// refresher (so hand-seeded entries are never deactivated).
func (r *Repository) DeactivateOldVideos(category, today string) error {
	// The refresher IDs are of the form "yt_<cat>_<youtubeId>".
	// We deactivate rows in this category that haven't been updated today.
	_, err := r.db.Exec(`
		UPDATE explore_videos
		SET    is_active  = FALSE,
		       updated_at = NOW()
		WHERE  category = $1
		  AND  id LIKE 'yt_%'
		  AND  DATE(updated_at) < $2::date
	`, category, today)
	return err
}
