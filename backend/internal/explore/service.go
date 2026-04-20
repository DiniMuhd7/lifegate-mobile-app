package explore

// DailyVideoCap is the total number of videos a user can claim rewards for per day.
// 10 videos × 8 categories = 80.
const DailyVideoCap = 80

// Service holds business logic for the explore feature.
type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ListVideos returns active videos. Pass an empty string to return all categories.
func (s *Service) ListVideos(category string) ([]Video, error) {
	return s.repo.ListActiveVideos(category)
}

// GetDailyRewardedIDs returns the video IDs the user has already claimed today.
func (s *Service) GetDailyRewardedIDs(userID string) ([]string, error) {
	return s.repo.GetDailyRewardedIDs(userID)
}

// ClaimReward records a reward and returns how many coins were earned.
func (s *Service) ClaimReward(userID, videoID string) (coinsEarned int, alreadyClaimed bool, capReached bool, err error) {
	return s.repo.ClaimReward(userID, videoID, DailyVideoCap)
}
