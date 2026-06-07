package explore

import (
	"database/sql"
	"strings"
	"time"
)

// TrendingCategory is a server-managed trending health category.
// Rows in explore_trending_categories can be toggled or replaced by admins
// at any time to rotate what appears as "trending" on the Explore screen.
type TrendingCategory struct {
	Name  string `json:"name"`
	Query string `json:"query"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

// Video is a health education video record stored in the DB.
type Video struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Category        string `json:"category"`
	Language        string `json:"language,omitempty"`
	DurationSeconds int    `json:"durationSeconds"`
	Coins           int    `json:"coins"`
	ThumbnailColor  string `json:"thumbnailColor"`
	ThumbnailIcon   string `json:"thumbnailIcon"`
	Instructor      string `json:"instructor"`
	YoutubeID       string `json:"youtubeId"`
	IsShort         bool   `json:"isShort"`
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

// ListActiveVideos returns active videos with a deterministic daily rotation.
// dateSeed (YYYY-MM-DD) acts as a salt for hashtext() so the ORDER BY changes
// every day, presenting a different subset of the accumulated 30-day pool to
// each user without any true randomness (consistent within a day).
func (r *Repository) ListActiveVideos(category, language, dateSeed string) ([]Video, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if language == "" {
		language = defaultExploreLanguage
	}
	if dateSeed == "" {
		dateSeed = time.Now().UTC().Format("2006-01-02")
	}
	if category != "" {
		rows, err = r.db.Query(`
			SELECT id, title, description, category, COALESCE(language, 'en'), duration_seconds, coins,
			       thumbnail_color, thumbnail_icon, instructor, youtube_id, is_short
			FROM   explore_videos
			WHERE  is_active = TRUE AND category = $1 AND COALESCE(language, 'en') = $2
			ORDER  BY hashtext(id || $3) ASC
		`, category, language, dateSeed)
	} else {
		rows, err = r.db.Query(`
			SELECT id, title, description, category, COALESCE(language, 'en'), duration_seconds, coins,
			       thumbnail_color, thumbnail_icon, instructor, youtube_id, is_short
			FROM   explore_videos
			WHERE  is_active = TRUE AND COALESCE(language, 'en') = $1
			ORDER  BY hashtext(id || $2) ASC
		`, language, dateSeed)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []Video
	for rows.Next() {
		var v Video
		if err := rows.Scan(
			&v.ID, &v.Title, &v.Description, &v.Category, &v.Language,
			&v.DurationSeconds, &v.Coins,
			&v.ThumbnailColor, &v.ThumbnailIcon,
			&v.Instructor, &v.YoutubeID, &v.IsShort,
		); err != nil {
			return nil, err
		}
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

// GetUserLanguage returns the patient's saved language preference.
// Empty/unknown values fall back to English in the service layer.
func (r *Repository) GetUserLanguage(userID string) (string, error) {
	var language string
	err := r.db.QueryRow(`SELECT COALESCE(language, '') FROM users WHERE id = $1::uuid`, userID).Scan(&language)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return language, err
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
			(id, title, description, category, language, duration_seconds, coins,
			 thumbnail_color, thumbnail_icon, instructor, youtube_id,
			 is_active, sort_order, is_short)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13)
		ON CONFLICT (id) DO UPDATE SET
			title            = EXCLUDED.title,
			description      = EXCLUDED.description,
			language         = EXCLUDED.language,
			duration_seconds = EXCLUDED.duration_seconds,
			coins            = EXCLUDED.coins,
			thumbnail_color  = EXCLUDED.thumbnail_color,
			thumbnail_icon   = EXCLUDED.thumbnail_icon,
			instructor       = EXCLUDED.instructor,
			youtube_id       = EXCLUDED.youtube_id,
			is_active        = TRUE,
			sort_order       = EXCLUDED.sort_order,
			is_short         = EXCLUDED.is_short,
			updated_at       = NOW()
	`,
		v.ID, v.Title, v.Description, v.Category,
		v.Language,
		v.DurationSeconds, v.Coins,
		v.ThumbnailColor, v.ThumbnailIcon,
		v.Instructor, v.YoutubeID,
		sortOrder, v.IsShort,
	)
	return err
}

// DeactivateOldVideos marks all videos in a category that were NOT refreshed
// today as inactive. Videos are identified by the "yt_" prefix added by the
// refresher (so hand-seeded entries are never deactivated).
func (r *Repository) DeactivateOldVideos(category, language, today string) error {
	if language == "" {
		language = defaultExploreLanguage
	}
	// The refresher IDs are of the form "yt_<cat>_<youtubeId>".
	// We deactivate rows in this category that haven't been updated today.
	_, err := r.db.Exec(`
		UPDATE explore_videos
		SET    is_active  = FALSE,
		       updated_at = NOW()
		WHERE  category = $1
		  AND  COALESCE(language, 'en') = $2
		  AND  id LIKE 'yt_%'
		  AND  DATE(updated_at) < $3::date
	`, category, language, today)
	return err
}

// FilterUnseenYoutubeIDs returns the subset of the given YouTube video IDs that
// have NEVER been stored before (active or inactive). Used so on-demand fetches
// only ever ingest brand-new videos and never re-ingest ones already fetched.
func (r *Repository) FilterUnseenYoutubeIDs(ids []string) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(
		`SELECT youtube_id FROM explore_videos WHERE youtube_id = ANY($1)`,
		pqStringArray(ids),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	known := make(map[string]struct{})
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			known[id] = struct{}{}
		}
	}

	unseen := make([]string, 0, len(ids))
	for _, id := range ids {
		if _, seen := known[id]; !seen {
			unseen = append(unseen, id)
		}
	}
	return unseen, rows.Err()
}

// pqStringArray formats a Go string slice as a Postgres text array literal so it
// can be passed to `= ANY($1)` without importing the pq array helper here.
func pqStringArray(items []string) string {
	var b strings.Builder
	b.WriteByte('{')
	for i, s := range items {
		if i > 0 {
			b.WriteByte(',')
		}
		// Quote and escape each element for safety.
		b.WriteByte('"')
		b.WriteString(strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`))
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

// CountActiveVideos returns how many active videos exist for a language.
// Used by the one-time startup pre-warm to decide whether the catalogue needs
// an initial broad fetch.
func (r *Repository) CountActiveVideos(language string) (int, error) {
	if language == "" {
		language = defaultExploreLanguage
	}
	var n int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM explore_videos
		WHERE is_active = TRUE AND COALESCE(language, 'en') = $1`, language).Scan(&n)
	return n, err
}

// UserPersonalizationData contains everything the scoring algorithm needs to
// rank the video catalogue for a specific user.
type UserPersonalizationData struct {
	Gender             string
	MedicalHistory     string
	CurrentMedications string
	Allergies          string
	// DiagnosedConditions lists condition strings from the user's case history.
	DiagnosedConditions []string
	// CategoryInterest maps category name → claim count in the last 30 days.
	// Higher count = stronger demonstrated interest.
	CategoryInterest map[string]int
	// WatchedVideoIDs is the set of video IDs the user has interacted with in
	// the last 14 days so they can be de-prioritised in the ranking.
	WatchedVideoIDs map[string]struct{}
}

// GetUserPersonalizationData fetches the user's health profile and engagement
// history in two queries and returns it for the scoring algorithm.
func (r *Repository) GetUserPersonalizationData(userID string) (UserPersonalizationData, error) {
	var d UserPersonalizationData
	d.CategoryInterest = make(map[string]int)
	d.WatchedVideoIDs  = make(map[string]struct{})

	// 1. Health profile + recent diagnosed conditions (last 6 months, ≤10 rows)
	profileRow := r.db.QueryRow(`
		SELECT
		    COALESCE(u.gender,''),
		    COALESCE(u.medical_history,''),
		    COALESCE(u.current_medications,''),
		    COALESCE(u.allergies,''),
		    COALESCE(
		        (SELECT string_agg(DISTINCT d.condition, '|')
		         FROM   diagnoses d
		         WHERE  d.user_id = u.id
		           AND  d.condition IS NOT NULL
		           AND  d.condition <> ''
		           AND  d.created_at >= NOW() - INTERVAL '6 months'
		        ), '')
		FROM users u
		WHERE u.id = $1::uuid`, userID)
	var conditionsStr string
	if err := profileRow.Scan(&d.Gender, &d.MedicalHistory, &d.CurrentMedications,
		&d.Allergies, &conditionsStr); err != nil && err.Error() != "sql: no rows in result set" {
		return d, err
	}
	if conditionsStr != "" {
		for _, c := range splitPipe(conditionsStr) {
			if c != "" {
				d.DiagnosedConditions = append(d.DiagnosedConditions, c)
			}
		}
	}

	// 2. Category engagement from claimed rewards (last 30 days)
	catRows, err := r.db.Query(`
		SELECT ev.category, COUNT(*) AS claim_count
		FROM   explore_video_rewards evr
		JOIN   explore_videos ev ON ev.id = evr.video_id
		WHERE  evr.user_id    = $1
		  AND  evr.rewarded_on >= CURRENT_DATE - INTERVAL '30 days'
		GROUP  BY ev.category`, userID)
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var cat string
			var cnt int
			if catRows.Scan(&cat, &cnt) == nil && cat != "" {
				d.CategoryInterest[cat] = cnt
			}
		}
	}

	// 3. Watched video IDs (last 30 days = the active catalogue pool lifetime).
	//    Used to EXCLUDE already-watched videos from the feed entirely, so a
	//    user never sees the same video twice — claimed or not.
	watchRows, err := r.db.Query(`
		SELECT video_id
		FROM   explore_video_interactions
		WHERE  user_id       = $1
		  AND  interacted_on >= CURRENT_DATE - INTERVAL '30 days'`, userID)
	if err == nil {
		defer watchRows.Close()
		for watchRows.Next() {
			var vid string
			if watchRows.Scan(&vid) == nil {
				d.WatchedVideoIDs[vid] = struct{}{}
			}
		}
	}

	return d, nil
}

// RecordInteraction upserts a watch event for a user. If a row for today
// already exists, it updates watch_seconds and completed only if the new
// values are greater (idempotent, safe to call multiple times).
func (r *Repository) RecordInteraction(userID, videoID, category string, watchSeconds int, completed, isShort bool) error {
	_, err := r.db.Exec(`
		INSERT INTO explore_video_interactions
		    (user_id, video_id, category, watch_seconds, completed, is_short, interacted_on)
		VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
		ON CONFLICT (user_id, video_id, interacted_on) DO UPDATE
		    SET watch_seconds = GREATEST(explore_video_interactions.watch_seconds, EXCLUDED.watch_seconds),
		        completed     = explore_video_interactions.completed OR EXCLUDED.completed`,
		userID, videoID, category, watchSeconds, completed, isShort)
	return err
}

// splitPipe splits a pipe-delimited string.
func splitPipe(s string) []string {
	var out []string
	for _, part := range splitBy(s, '|') {
		out = append(out, strings.TrimSpace(part))
	}
	return out
}

func splitBy(s string, sep byte) []string {
	var out []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	out = append(out, s[start:])
	return out
}

// ListTrendingCategories returns all active rows from explore_trending_categories.
// The refresher calls this before each run so newly activated / deactivated
// trending categories are picked up automatically without a code deployment.
func (r *Repository) ListTrendingCategories() ([]TrendingCategory, error) {
	rows, err := r.db.Query(`
		SELECT name, query, color, icon
		FROM   explore_trending_categories
		WHERE  is_active = TRUE
		ORDER  BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []TrendingCategory
	for rows.Next() {
		var c TrendingCategory
		if err := rows.Scan(&c.Name, &c.Query, &c.Color, &c.Icon); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}
