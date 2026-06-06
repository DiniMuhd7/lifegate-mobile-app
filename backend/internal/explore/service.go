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

// Service holds business logic for the explore feature.
type Service struct {
	repo      *Repository
	refresher *Refresher
	lifecoins LifecoinsAdder
	refreshMu sync.Mutex
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
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

	videos, err := s.repo.ListActiveVideos(category, language, dateSeed)
	if err != nil {
		return nil, err
	}

	// On-demand refresh if catalogue is empty
	if len(videos) == 0 && s.refresher != nil {
		s.refreshMu.Lock()
		videos2, _ := s.repo.ListActiveVideos(category, language, dateSeed)
		if len(videos2) == 0 {
			s.refresher.RunOnceForLanguage(context.Background(), language)
			videos, err = s.repo.ListActiveVideos(category, language, dateSeed)
		} else {
			videos = videos2
		}
		s.refreshMu.Unlock()
		if err != nil {
			return nil, err
		}
	}

	// English fallback
	if len(videos) == 0 && language != defaultExploreLanguage {
		videos, err = s.repo.ListActiveVideos(category, defaultExploreLanguage, dateSeed)
		if err != nil {
			return nil, err
		}
	}

	// Personalize — best-effort: if profile fetch fails, serve unranked catalogue
	if len(videos) > 0 && userID != "" {
		profile, profileErr := s.repo.GetUserPersonalizationData(userID)
		if profileErr == nil {
			videos = rankVideos(videos, profile)
		}
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
