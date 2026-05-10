package explore

import (
	"context"
	"strings"
	"sync"
	"time"
)

// DailyVideoCap is the total number of videos a user can claim rewards for per day.
// 10 videos × 16 categories = 160.
const DailyVideoCap = 160

const defaultExploreLanguage = "en"

// LifecoinsAdder is a minimal interface for awarding Lifecoins after a video watch.
// Implemented by payments.Service — using an interface avoids an import cycle.
type LifecoinsAdder interface {
	AddLifecoins(userID, source, description string, coins int) error
}

// Service holds business logic for the explore feature.
type Service struct {
	repo      *Repository
	refresher *Refresher
	lifecoins LifecoinsAdder
	// Ensures at most one on-demand refresh runs at a time.
	refreshMu sync.Mutex
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetLifecoinsAdder wires the Lifecoins award service into the explore service
// so that a successful video-claim also credits the user's wallet.
func (s *Service) SetLifecoinsAdder(a LifecoinsAdder) {
	s.lifecoins = a
}

// SetRefresher wires the YouTube refresher into the service so that ListVideos
// can trigger an on-demand refresh when the catalogue is empty.
func (s *Service) SetRefresher(r *Refresher) {
	s.refresher = r
}

// ListVideos returns active videos for the patient's preferred language.
// langOverride — when non-empty — is used directly so the mobile client can
// reflect a language change without waiting for the profile-sync DB write.
// It falls back to English when the resolved language has no catalogue yet.
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

	// dateSeed changes daily so hashtext(id || seed) produces a different
	// ordering each day, rotating the displayed subset of the 30-day pool.
	dateSeed := time.Now().UTC().Format("2006-01-02")

	videos, err := s.repo.ListActiveVideos(category, language, dateSeed)
	if err != nil {
		return nil, err
	}

	// On-demand refresh: if the requested language catalogue is empty and a
	// refresher is available, run it synchronously once, then re-query.
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

	if len(videos) == 0 && language != defaultExploreLanguage {
		videos, err = s.repo.ListActiveVideos(category, defaultExploreLanguage, dateSeed)
		if err != nil {
			return nil, err
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

// GetTrendingCategories returns the active trending categories from the DB.
// Returns an empty slice (never nil) on error so the API response degrades
// gracefully rather than failing the whole videos request.
func (s *Service) GetTrendingCategories() []TrendingCategory {
	cats, err := s.repo.ListTrendingCategories()
	if err != nil {
		return []TrendingCategory{}
	}
	if cats == nil {
		return []TrendingCategory{}
	}
	return cats
}

// ClaimReward records a reward and returns how many coins were earned.
// On success it also credits the user's Lifecoins wallet (best-effort).
func (s *Service) ClaimReward(userID, videoID string) (coinsEarned int, alreadyClaimed bool, capReached bool, err error) {
	coinsEarned, alreadyClaimed, capReached, err = s.repo.ClaimReward(userID, videoID, DailyVideoCap)
	if err == nil && !alreadyClaimed && !capReached && coinsEarned > 0 && s.lifecoins != nil {
		_ = s.lifecoins.AddLifecoins(userID, "explore", "Explore video reward", coinsEarned)
	}
	return
}

// TriggerRefresh forces an immediate YouTube catalogue refresh regardless of
// whether one has already run today. Intended for admin use only.
func (s *Service) TriggerRefresh() {
	if s.refresher == nil {
		return
	}
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	// Reset per-language run guards so RunOnce does not skip the run.
	s.refresher.runMu.Lock()
	s.refresher.lastRunDateByLanguage = map[string]string{}
	s.refresher.runMu.Unlock()
	s.refresher.RunOnce(context.Background())
}
