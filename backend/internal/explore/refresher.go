package explore

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// categoryQuery maps each video category to the YouTube search query used to
// find relevant health education videos.
var categoryQuery = map[string]string{
	"Nutrition":       "healthy nutrition diet tips science education",
	"Mental Health":   "mental health stress anxiety wellness education",
	"Fitness":         "exercise workout fitness health benefits",
	"Prevention":      "disease prevention health screening checkup",
	"Medication":      "medication safety how medicines work pharmacy",
	"Maternal Health": "maternal health pregnancy antenatal care mother",
	"Public Health":   "public health community disease prevention epidemiology",
	"Primary Care":    "primary care family doctor general practitioner checkup",
}

// categoryMeta carries the display metadata assigned to each category.
var categoryMeta = map[string]struct {
	color string
	icon  string
}{
	"Nutrition":       {"#f59e0b", "nutrition-outline"},
	"Mental Health":   {"#8b5cf6", "happy-outline"},
	"Fitness":         {"#10b981", "barbell-outline"},
	"Prevention":      {"#0284c7", "shield-checkmark-outline"},
	"Medication":      {"#059669", "medkit-outline"},
	"Maternal Health": {"#db2777", "rose-outline"},
	"Public Health":   {"#0891b2", "earth-outline"},
	"Primary Care":    {"#16a34a", "home-outline"},
}

// ytSearchItem represents a single result from the YouTube search API.
type ytSearchItem struct {
	ID struct {
		VideoID string `json:"videoId"`
	} `json:"id"`
	Snippet struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		ChannelTitle string `json:"channelTitle"`
	} `json:"snippet"`
}

// ytVideoDetails holds contentDetails returned by the videos.list endpoint.
type ytVideoDetails struct {
	ID             string `json:"id"`
	ContentDetails struct {
		Duration string `json:"duration"` // ISO 8601 e.g. PT4M13S
	} `json:"contentDetails"`
}

// Refresher searches YouTube daily and upserts fresh videos into the explore
// catalogue. It keeps the most recent 3 videos per category active and marks
// older entries as inactive.
type Refresher struct {
	repo      *Repository
	apiKey    string
	videosPerCat int
}

// NewRefresher creates a Refresher. videosPerCat controls how many fresh
// results to fetch per category on each run (2–4 is recommended to stay
// within the free YouTube Data API quota).
func NewRefresher(repo *Repository, apiKey string, videosPerCat int) *Refresher {
	if videosPerCat < 1 {
		videosPerCat = 3
	}
	return &Refresher{repo: repo, apiKey: apiKey, videosPerCat: videosPerCat}
}

// Start runs the daily refresh loop. It fires once immediately at startup (to
// populate fresh content on first deploy) and then again at every subsequent
// midnight UTC so that fresh videos are available at the start of each new
// calendar day regardless of when the server was started.
func (r *Refresher) Start(ctx context.Context) {
	if r.apiKey == "" {
		log.Println("[explore/refresher] YOUTUBE_DATA_API_KEY not set — skipping daily refresh")
		return
	}

	// Run immediately on startup.
	r.run(ctx)

	for {
		// Sleep until the next midnight UTC.
		now := time.Now().UTC()
		nextMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
		select {
		case <-time.After(time.Until(nextMidnight)):
			r.run(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// run performs a single refresh cycle across all categories.
func (r *Refresher) run(ctx context.Context) {
	log.Println("[explore/refresher] Starting daily YouTube video refresh…")

	today := time.Now().UTC().Format("2006-01-02")
	sortBase := int(time.Now().Unix()) // unique offset per run

	for cat, query := range categoryQuery {
		select {
		case <-ctx.Done():
			return
		default:
		}

		videos, err := r.searchCategory(ctx, cat, query)
		if err != nil {
			log.Printf("[explore/refresher] search failed for %q: %v", cat, err)
			continue
		}
		if len(videos) == 0 {
			log.Printf("[explore/refresher] no usable results for %q", cat)
			continue
		}

		// Deactivate yesterday's entries for this category so the catalogue
		// stays fresh without accumulating stale rows.
		if err := r.repo.DeactivateOldVideos(cat, today); err != nil {
			log.Printf("[explore/refresher] deactivate failed for %q: %v", cat, err)
		}

		for i, v := range videos {
			sortOrder := sortBase + i
			if err := r.repo.UpsertVideo(v, sortOrder); err != nil {
				log.Printf("[explore/refresher] upsert failed for %q (%s): %v", v.Title, v.ID, err)
			}
		}

		log.Printf("[explore/refresher] refreshed %d video(s) for category %q", len(videos), cat)
		// Be polite to the YouTube API quota — small delay between categories.
		time.Sleep(300 * time.Millisecond)
	}

	log.Println("[explore/refresher] Daily refresh complete.")
}

// searchCategory queries YouTube for videos matching the given category query
// across both medium (4–20 min) and long (>20 min) duration bands, fetches
// exact durations via videos.list, and returns Video objects in the 5–30 min
// range ready for the DB.
func (r *Refresher) searchCategory(ctx context.Context, category, query string) ([]Video, error) {
	type searchResp struct {
		Items []ytSearchItem `json:"items"`
	}

	// ── 1. Search medium duration band (4–20 min) ──────────────────────────
	// YouTube API: medium = 4–20 min. We filter precisely to 5–20 min in code.
	allIDs := make([]string, 0, r.videosPerCat)
	byID := make(map[string]ytSearchItem, r.videosPerCat)

	searchURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video&videoDuration=medium&maxResults=%d&relevanceLanguage=en&safeSearch=strict&key=%s",
		url.QueryEscape(query),
		r.videosPerCat,
		r.apiKey,
	)
	sr, err := ytGet[searchResp](ctx, searchURL)
	if err != nil {
		return nil, fmt.Errorf("search (medium) request: %w", err)
	}
	for _, it := range sr.Items {
		vid := it.ID.VideoID
		if _, seen := byID[vid]; !seen {
			allIDs = append(allIDs, vid)
			byID[vid] = it
		}
	}

	if len(allIDs) == 0 {
		return nil, nil
	}

	// ── 2. Fetch exact durations via videos.list ──────────────────────────
	detailsURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=%s&key=%s",
		url.QueryEscape(strings.Join(allIDs, ",")),
		r.apiKey,
	)
	type detailsResp struct {
		Items []ytVideoDetails `json:"items"`
	}
	dr, err := ytGet[detailsResp](ctx, detailsURL)
	if err != nil {
		return nil, fmt.Errorf("details request: %w", err)
	}

	// ── 3. Build Video list — keep only 5–30 min videos ─────────────────
	meta := categoryMeta[category]
	var out []Video
	for _, d := range dr.Items {
		dur := parseISO8601Duration(d.ContentDetails.Duration)
		// Keep only videos in the 5–20 min range (300–1200 s).
		if dur < 300 || dur > 1200 {
			continue
		}

		snippet := byID[d.ID].Snippet
		desc := snippet.Description
		if len(desc) > 180 {
			desc = desc[:177] + "…"
		}
		desc = strings.ReplaceAll(desc, "\n", " ")

		// Coin tiers: 5 min=3, 10 min=4, 15 min+=5.
		coins := 3
		if dur >= 900 {
			coins = 5
		} else if dur >= 600 {
			coins = 4
		}

		out = append(out, Video{
			ID:              fmt.Sprintf("yt_%s_%s", sanitizeID(category), d.ID),
			Title:           snippet.Title,
			Description:     desc,
			Category:        category,
			DurationSeconds: dur,
			Coins:           coins,
			ThumbnailColor:  meta.color,
			ThumbnailIcon:   meta.icon,
			Instructor:      snippet.ChannelTitle,
			YoutubeID:       d.ID,
		})
	}
	return out, nil
}

// ytGet performs a GET request to the YouTube API and unmarshals the response
// into T. It is a package-level generic function (methods cannot be generic in Go).
func ytGet[T any](ctx context.Context, rawURL string) (T, error) {
	var zero T
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return zero, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, err
	}
	if resp.StatusCode != http.StatusOK {
		return zero, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result T
	if err := json.Unmarshal(body, &result); err != nil {
		return zero, err
	}
	return result, nil
}

// parseISO8601Duration converts a YouTube duration string (PT4M13S) to seconds.
func parseISO8601Duration(s string) int {
	s = strings.TrimPrefix(s, "PT")
	var total, cur int
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9':
			cur = cur*10 + int(c-'0')
		case c == 'H':
			total += cur * 3600
			cur = 0
		case c == 'M':
			total += cur * 60
			cur = 0
		case c == 'S':
			total += cur
			cur = 0
		}
	}
	return total
}

// sanitizeID converts a category name to a lowercase underscore identifier.
func sanitizeID(cat string) string {
	return strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(cat, " ", "_"), "/", "_"))
}
