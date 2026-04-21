package explore

import (
	"context"
	"sync"
)

// DailyVideoCap is the total number of videos a user can claim rewards for per day.
// 10 videos × 8 categories = 80.
const DailyVideoCap = 80

// Service holds business logic for the explore feature.
type Service struct {
	repo      *Repository
	refresher *Refresher
	// Ensures at most one on-demand refresh runs at a time.
	refreshMu sync.Mutex
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetRefresher wires the YouTube refresher into the service so that ListVideos
// can trigger an on-demand refresh when the catalogue is empty.
func (s *Service) SetRefresher(r *Refresher) {
	s.refresher = r
}

// ListVideos returns active videos. Pass an empty string to return all categories.
// If the catalogue is empty and a refresher is configured, it triggers a
// synchronous YouTube fetch before returning the results.
func (s *Service) ListVideos(category string) ([]Video, error) {
	videos, err := s.repo.ListActiveVideos(category)
	if err != nil {
		return nil, err
	}

	// On-demand refresh: if the DB is empty and a refresher is available, run
	// it synchronously once, then re-query. The mutex prevents stampedes.
	if len(videos) == 0 && s.refresher != nil {
		s.refreshMu.Lock()
		// Re-check after acquiring the lock — a concurrent goroutine may have
		// already populated the catalogue.
		videos2, _ := s.repo.ListActiveVideos(category)
		if len(videos2) == 0 {
			s.refresher.RunOnce(context.Background())
			videos, err = s.repo.ListActiveVideos(category)
		} else {
			videos = videos2
		}
		s.refreshMu.Unlock()
		if err != nil {
			return nil, err
		}
	}

	return videos, nil
}

// GetDailyRewardedIDs returns the video IDs the user has already claimed today.
func (s *Service) GetDailyRewardedIDs(userID string) ([]string, error) {
	return s.repo.GetDailyRewardedIDs(userID)
}

// ClaimReward records a reward and returns how many coins were earned.
func (s *Service) ClaimReward(userID, videoID string) (coinsEarned int, alreadyClaimed bool, capReached bool, err error) {
	return s.repo.ClaimReward(userID, videoID, DailyVideoCap)
}
