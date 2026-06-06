package explore

import (
	"context"
	"log"
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

// rankVideos orders videos by the user's profile while INTERLEAVING categories
// so the feed is a varied mix — not a single solid block of the top-scoring
// category. A pure score sort would cluster every video of the highest category
// (e.g. all Dermatology) at the front, so in a one-at-a-time swipe feed the user
// only ever sees that one category. Instead we:
//
//  1. Score every video and group by category.
//  2. Order categories by their relevance score (highest first).
//  3. Round-robin pick one video from each category in that order, repeating,
//     so the output alternates categories (top, 2nd, 3rd, top, 2nd, …) — the
//     user's preferred categories appear most often but variety is guaranteed.
func rankVideos(videos []Video, profile UserPersonalizationData) []Video {
	catScores := buildCategoryScores(profile)

	type scored struct {
		v     Video
		score float64
	}

	// Group videos by category; track each category's best score for ordering.
	groups := make(map[string][]scored)
	catBest := make(map[string]float64)
	for _, v := range videos {
		sc := scoreVideo(v, profile, catScores)
		groups[v.Category] = append(groups[v.Category], scored{v, sc})
		if sc > catBest[v.Category] {
			catBest[v.Category] = sc
		}
	}

	// Sort each category's videos by score (highest first).
	for cat := range groups {
		g := groups[cat]
		sort.SliceStable(g, func(i, j int) bool { return g[i].score > g[j].score })
		groups[cat] = g
	}

	// Order the categories themselves by their best score.
	cats := make([]string, 0, len(groups))
	for cat := range groups {
		cats = append(cats, cat)
	}
	sort.SliceStable(cats, func(i, j int) bool { return catBest[cats[i]] > catBest[cats[j]] })

	// Round-robin across categories (in score order) to interleave the feed.
	out := make([]Video, 0, len(videos))
	idx := make(map[string]int, len(cats))
	for len(out) < len(videos) {
		progressed := false
		for _, cat := range cats {
			i := idx[cat]
			if i < len(groups[cat]) {
				out = append(out, groups[cat][i].v)
				idx[cat] = i + 1
				progressed = true
			}
		}
		if !progressed {
			break
		}
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
	// No daily cron: fetch from YouTube using queries built from THIS user's
	// profile when their feed lacks content matched to them. Crucially we look
	// at coverage of the user's OWN preferred categories — not just the total
	// count — so a user never just inherits a catalogue full of some other
	// user's category (e.g. all Dermatology). Throttled per user for quota.
	queries := buildUserQueries(profile)
	preferred := make(map[string]bool, len(queries))
	for _, q := range queries {
		preferred[q.Category] = true
	}
	freshInPreferred := 0
	for _, v := range videos {
		if preferred[v.Category] {
			freshInPreferred++
		}
	}

	// We need a fetch when the overall pool is thin OR the user's own preferred
	// categories are under-represented in what we can show them.
	needFetch := len(videos) < minFreshVideos || freshInPreferred < minFreshVideos

	if needFetch && s.refresher != nil {
		s.userFetchMu.Lock()
		last := s.lastUserFetch[userID]
		canFetch := userID != "" && time.Since(last) > userFetchCooldown
		// First-time / empty-pool cases bypass the cooldown so the user is not
		// left looking at irrelevant content.
		if len(videos) == 0 || freshInPreferred == 0 {
			canFetch = canFetch || time.Since(last) > 2*time.Minute
		}
		if canFetch {
			s.lastUserFetch[userID] = time.Now()
		}
		s.userFetchMu.Unlock()

		if canFetch {
			// Fetch SYNCHRONOUSLY when we have nothing relevant to show this
			// user (empty pool, or none of their preferred categories present) —
			// worth a one-time wait so they immediately get their own content.
			// Otherwise top up in the BACKGROUND and serve existing videos now.
			if len(videos) == 0 || freshInPreferred == 0 {
				s.refreshMu.Lock()
				s.refresher.FetchForQueries(context.Background(), queries, language)
				s.refreshMu.Unlock()
				if v2, e := freshFor(); e == nil {
					videos = v2
				}
			} else {
				go func() {
					s.refreshMu.Lock()
					defer s.refreshMu.Unlock()
					s.refresher.FetchForQueries(context.Background(), queries, language)
				}()
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

// prewarmThreshold is the minimum active-video count below which the one-time
// startup pre-warm runs a broad category sweep so the catalogue is varied
// immediately rather than filling in per-user.
const prewarmThreshold = 40

// Prewarm runs ONCE at startup. If the catalogue has fewer than
// prewarmThreshold active videos in the default language, it performs a single
// broad category sweep so the feed is diverse on first use. This is NOT a
// recurring cron — after the catalogue is populated it never runs the sweep
// again; ongoing freshness comes from the per-user on-demand fetch.
func (s *Service) Prewarm(ctx context.Context) {
	if s.refresher == nil {
		return
	}
	n, err := s.repo.CountActiveVideos(defaultExploreLanguage)
	if err != nil {
		return
	}
	if n >= prewarmThreshold {
		log.Printf("[explore] pre-warm skipped — catalogue already has %d active videos", n)
		return
	}
	log.Printf("[explore] pre-warming catalogue (only %d active videos) — broad category sweep…", n)
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	s.refresher.RunOnce(ctx)
}
