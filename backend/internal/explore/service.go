package explore

import (
	"context"
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// DailyVideoCap is the total number of videos a user can claim rewards for per day.
const DailyVideoCap = 160

const defaultExploreLanguage = "en"

// LifecoinsAdder is a minimal interface for awarding Lifecoins after a video watch.
type LifecoinsAdder interface {
	AddLifecoins(userID, source, description string, coins int) error
	EarnLifecoins(userID, source, description string, baseCoins int) error
}

// minFreshVideos is the threshold below which an on-demand personalised fetch
// is triggered for a user. When a user has fewer unwatched videos than this in
// the catalogue, we pull fresh ones from YouTube matched to their profile.
const minFreshVideos = 6

// userFetchCooldown throttles per-user on-demand YouTube fetches so the API
// quota is not exhausted by repeated opens.
const userFetchCooldown = 90 * time.Minute

// Service holds business logic for the explore feature.
type Service struct {
	repo      *Repository
	refresher *Refresher
	lifecoins LifecoinsAdder
	refreshMu sync.Mutex

	// Per-user on-demand fetch throttle (in-memory; resets on restart).
	userFetchMu   sync.Mutex
	lastUserFetch map[string]time.Time
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo, lastUserFetch: make(map[string]time.Time)}
}

func (s *Service) SetLifecoinsAdder(a LifecoinsAdder) { s.lifecoins = a }
func (s *Service) SetRefresher(r *Refresher)          { s.refresher = r }

// ── Personalization ───────────────────────────────────────────────────────────

// conditionCategoryMap maps health condition keywords to explore categories.
// Mirrors the client-side CONDITION_CATEGORY_MAP so server and client agree.
var conditionCategoryMap = []struct {
	pattern  *regexp.Regexp
	category string
}{
	{regexp.MustCompile(`(?i)cardio|heart|hypertension|blood.?pressure|cardiac|coronary`), "Cardiology"},
	{regexp.MustCompile(`(?i)diabet|glucose|insulin|blood.?sugar`), "Diabetes"},
	{regexp.MustCompile(`(?i)anxiety|depress|mental|stress|psychiatr|bipolar`), "Mental Health"},
	{regexp.MustCompile(`(?i)sleep|insomnia|fatigue|tired`), "Sleep & Recovery"},
	{regexp.MustCompile(`(?i)skin|dermat|eczema|acne|rash|psoriasis`), "Dermatology"},
	{regexp.MustCompile(`(?i)pregnan|antenatal|maternal|prenatal|postpartum`), "Maternal Health"},
	{regexp.MustCompile(`(?i)child|pediatr|infant|toddler|newborn`), "Pediatrics"},
	{regexp.MustCompile(`(?i)pcos|gynecol|menstrual|menopause|hormonal`), "Women's Health"},
	{regexp.MustCompile(`(?i)prostate|testosterone|erectile`), "Men's Health"},
	{regexp.MustCompile(`(?i)nutrition|vitamin|anemia|iron|deficien|malnouris`), "Nutrition"},
	{regexp.MustCompile(`(?i)chronic|long.?term|ongoing|persistent`), "Chronic Disease"},
	{regexp.MustCompile(`(?i)malaria|typhoid|infectious|epidemic|vaccin`), "Public Health"},
	{regexp.MustCompile(`(?i)medic|drug|pharmacol|prescription|dosage`), "Medication"},
	{regexp.MustCompile(`(?i)fitness|exercise|obesity|overweight|sedentary`), "Fitness"},
	{regexp.MustCompile(`(?i)gut|microbiome|probiotic|digest|ibs|bloat|bowel`), "Gut Health"},
	{regexp.MustCompile(`(?i)longevity|aging|lifespan|healthspan|anti.?aging`), "Longevity"},
}

// pillarCategories are always relevant to every user.
var pillarCategories = map[string]float64{
	"Primary Care": 12,
	"Prevention":   12,
	"Mental Health": 10,
	"Nutrition":    10,
	"Fitness":      8,
}

// buildCategoryScores derives a map of category → relevance score for a user.
// Score range is 0–100; higher = more relevant to this user's profile.
func buildCategoryScores(profile UserPersonalizationData) map[string]float64 {
	scores := make(map[string]float64)

	// 1. Platform pillars — baseline for everyone
	for cat, pts := range pillarCategories {
		scores[cat] += pts
	}

	// 2. Condition-based matches from diagnosed conditions
	condCorpus := strings.Join(profile.DiagnosedConditions, " ")
	for _, m := range conditionCategoryMap {
		if m.pattern.MatchString(condCorpus) {
			scores[m.category] += 30
		}
	}

	// 3. Free-text health profile matches
	healthText := strings.Join([]string{
		profile.MedicalHistory,
		profile.CurrentMedications,
		profile.Allergies,
	}, " ")
	for _, m := range conditionCategoryMap {
		if m.pattern.MatchString(healthText) {
			scores[m.category] += 15
		}
	}

	// 4. Gender-specific categories
	g := strings.ToLower(profile.Gender)
	if g == "female" || g == "f" {
		scores["Maternal Health"] += 20
		scores["Women's Health"]  += 20
	} else if g == "male" || g == "m" {
		scores["Men's Health"] += 20
	}

	// 5. Engagement signals — categories the user has watched and claimed
	for cat, count := range profile.CategoryInterest {
		// Each claimed video in a category adds 8 pts, capped at 40
		scores[cat] += math.Min(float64(count)*8, 40)
	}

	return scores
}

// scoreVideo computes a composite relevance score for one video.
//
// Factors (approximate ranges):
//   - Category match:   0–100  (profile-derived category score)
//   - Novelty:          0–25   (penalise recently watched)
//   - Short boost:      +5     (shorts get a small diversity boost)
func scoreVideo(v Video, profile UserPersonalizationData, catScores map[string]float64) float64 {
	score := catScores[v.Category] // 0..100

	// Novelty — reward unseen content
	if _, seen := profile.WatchedVideoIDs[v.ID]; !seen {
		score += 25
	}

	// Slight boost for shorts to ensure they surface in their lane
	if v.IsShort {
		score += 5
	}

	return score
}

// rankVideos scores every video against the user's profile and returns them
// sorted highest-first.  Equal scores preserve the deterministic DB order so
// the daily rotation still works as a tiebreaker.
func rankVideos(videos []Video, profile UserPersonalizationData) []Video {
	catScores := buildCategoryScores(profile)

	type scored struct {
		v     Video
		score float64
	}
	sv := make([]scored, len(videos))
	for i, v := range videos {
		sv[i] = scored{v: v, score: scoreVideo(v, profile, catScores)}
	}

	// Stable sort (preserves original order for equal scores)
	sort.SliceStable(sv, func(i, j int) bool {
		return sv[i].score > sv[j].score
	})

	out := make([]Video, len(sv))
	for i, s := range sv {
		out[i] = s.v
	}
	return out
}

// ── Per-user on-demand fetch query building ────────────────────────────────────

// userQuery pairs a category label with a YouTube search query used when
// fetching videos on demand for a specific user.
type userQuery struct {
	Category string
	Query    string
}

// matchCategory returns the explore category whose keyword pattern matches the
// given free text (a diagnosed condition), or "Primary Care" when none match.
func matchCategory(text string) string {
	for _, m := range conditionCategoryMap {
		if m.pattern.MatchString(text) {
			return m.category
		}
	}
	return "Primary Care"
}

// buildUserQueries derives a small set of YouTube search queries tailored to a
// single user from their health profile and engagement — NOT the fixed 16-
// category taxonomy. Each user therefore pulls content matched to their own
// conditions and interests. Returns 1–6 queries ordered by relevance.
func buildUserQueries(profile UserPersonalizationData) []userQuery {
	scores := buildCategoryScores(profile)

	type kv struct {
		cat   string
		score float64
	}
	ranked := make([]kv, 0, len(scores))
	for cat, s := range scores {
		ranked = append(ranked, kv{cat, s})
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })

	var qs []userQuery
	seen := map[string]bool{}

	// 1. Top relevant categories for this user (max 4) — driven by their profile
	//    score, not a blanket sweep of every category.
	for _, k := range ranked {
		if len(qs) >= 4 {
			break
		}
		key := strings.ToLower(k.cat)
		if seen[key] {
			continue
		}
		seen[key] = true
		q := categoryQuery[k.cat]
		if q == "" {
			q = k.cat + " health education doctor"
		}
		qs = append(qs, userQuery{Category: k.cat, Query: q})
	}

	// 2. Specific diagnosed conditions for precision (max 2 more) — raw condition
	//    text searched directly, mapped to a category only for display metadata.
	for _, cond := range profile.DiagnosedConditions {
		if len(qs) >= 6 {
			break
		}
		c := strings.TrimSpace(cond)
		if c == "" || seen[strings.ToLower(c)] {
			continue
		}
		seen[strings.ToLower(c)] = true
		qs = append(qs, userQuery{
			Category: matchCategory(c),
			Query:    c + " causes symptoms treatment doctor explained",
		})
	}

	// 3. Fallback for brand-new users with no profile signal yet.
	if len(qs) == 0 {
		qs = append(qs, userQuery{
			Category: "Primary Care",
			Query:    "general health wellness checkup prevention doctor education",
		})
	}

	return qs
}

// ListVideos returns a personalised, ranked video catalogue for the user.
// The ranking factors in:
//   - Health profile (conditions, medications, gender)
//   - Diagnosed conditions from recent cases
//   - Category engagement history (claimed videos)
//   - Watch novelty (recently seen videos ranked lower)
func (s *Service) ListVideos(userID, category, langOverride string) ([]Video, error) {
	var language string
	if langOverride != "" {
		language = normalizeExploreLanguage(langOverride)
	} else {
		var err error
		language, err = s.repo.GetUserLanguage(userID)
		if err != nil {
			return nil, err
		}
		language = normalizeExploreLanguage(language)
	}

	dateSeed := time.Now().UTC().Format("2006-01-02")

	// Load the user's personalisation profile once — drives both ranking and
	// the per-user on-demand fetch query.
	var profile UserPersonalizationData
	haveProfile := false
	if userID != "" {
		if p, perr := s.repo.GetUserPersonalizationData(userID); perr == nil {
			profile = p
			haveProfile = true
		}
	}

	// freshFor returns the active videos for this language with the user's
	// already-watched videos removed.
	freshFor := func() ([]Video, error) {
		vids, e := s.repo.ListActiveVideos(category, language, dateSeed)
		if e != nil {
			return nil, e
		}
		if haveProfile && len(profile.WatchedVideoIDs) > 0 {
			out := vids[:0:0]
			for _, v := range vids {
				if _, seen := profile.WatchedVideoIDs[v.ID]; !seen {
					out = append(out, v)
				}
			}
			return out, nil
		}
		return vids, nil
	}

	videos, err := freshFor()
	if err != nil {
		return nil, err
	}

	// ── On-demand personalised fetch ──────────────────────────────────────────
	// No daily cron: when the user has fewer fresh (unwatched) videos than the
	// threshold, fetch new ones from YouTube using queries built from THIS
	// user's profile (their conditions/interests — not the full category set).
	// Throttled per user so the API quota is preserved.
	if len(videos) < minFreshVideos && s.refresher != nil {
		s.userFetchMu.Lock()
		last := s.lastUserFetch[userID]
		canFetch := userID != "" && time.Since(last) > userFetchCooldown
		// Always allow a fetch when the catalogue is completely empty for this
		// language (e.g. first ever request after deploy), regardless of cooldown.
		if len(videos) == 0 {
			canFetch = canFetch || time.Since(last) > 2*time.Minute
		}
		if canFetch {
			s.lastUserFetch[userID] = time.Now()
		}
		s.userFetchMu.Unlock()

		if canFetch {
			queries := buildUserQueries(profile)
			s.refreshMu.Lock()
			s.refresher.FetchForQueries(context.Background(), queries, language)
			s.refreshMu.Unlock()
			// Re-query now that fresh videos are stored.
			if v2, e := freshFor(); e == nil {
				videos = v2
			}
		}
	}

	// English fallback when the user's language still has nothing.
	if len(videos) == 0 && language != defaultExploreLanguage {
		videos, err = s.repo.ListActiveVideos(category, defaultExploreLanguage, dateSeed)
		if err != nil {
			return nil, err
		}
	}

	// Rank the fresh videos against the user's profile.
	if len(videos) > 0 && haveProfile {
		videos = rankVideos(videos, profile)
	}

	return videos, nil
}

func normalizeExploreLanguage(language string) string {
	language = strings.TrimSpace(strings.ToLower(language))
	if language == "" {
		return defaultExploreLanguage
	}
	switch language {
	case "english", "eng":
		return "en"
	case "french", "francais", "français":
		return "fr"
	case "spanish", "espanol", "español":
		return "es"
	case "yoruba":
		return "yo"
	case "igbo":
		return "ig"
	case "hausa":
		return "ha"
	}
	if len(language) >= 2 {
		return language[:2]
	}
	return defaultExploreLanguage
}

// GetDailyRewardedIDs returns the video IDs the user has already claimed today.
func (s *Service) GetDailyRewardedIDs(userID string) ([]string, error) {
	return s.repo.GetDailyRewardedIDs(userID)
}

// GetTrendingCategories returns the active trending categories.
func (s *Service) GetTrendingCategories() []TrendingCategory {
	cats, err := s.repo.ListTrendingCategories()
	if err != nil || cats == nil {
		return []TrendingCategory{}
	}
	return cats
}

// ClaimReward records a reward and credits the user's wallet.
func (s *Service) ClaimReward(userID, videoID string) (coinsEarned int, alreadyClaimed bool, capReached bool, err error) {
	coinsEarned, alreadyClaimed, capReached, err = s.repo.ClaimReward(userID, videoID, DailyVideoCap)
	if err == nil && !alreadyClaimed && !capReached && coinsEarned > 0 && s.lifecoins != nil {
		_ = s.lifecoins.EarnLifecoins(userID, "explore", "Explore video reward", coinsEarned)
	}
	return
}

// RecordWatch records a user's watch event for a video.
// watchSeconds is how long the user actually watched; completed is true when
// they watched at least 70% of the video (the claim threshold).
func (s *Service) RecordWatch(userID, videoID, category string, watchSeconds int, completed, isShort bool) error {
	return s.repo.RecordInteraction(userID, videoID, category, watchSeconds, completed, isShort)
}

// TriggerRefresh forces an immediate YouTube catalogue refresh.
func (s *Service) TriggerRefresh() {
	if s.refresher == nil {
		return
	}
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	s.refresher.runMu.Lock()
	s.refresher.lastRunDateByLanguage = map[string]string{}
	s.refresher.runMu.Unlock()
	s.refresher.RunOnce(context.Background())
}
