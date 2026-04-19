package explore

const DailyVideoCap = 10

// Service holds business logic for the explore feature.
type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ListVideos returns all active videos.
func (s *Service) ListVideos() ([]Video, error) {
	return s.repo.ListActiveVideos()
}

// GetDailyRewardedIDs returns the video IDs the user has already claimed today.
func (s *Service) GetDailyRewardedIDs(userID string) ([]string, error) {
	return s.repo.GetDailyRewardedIDs(userID)
}

// ClaimReward records a reward and returns how many coins were earned.
func (s *Service) ClaimReward(userID, videoID string) (coinsEarned int, alreadyClaimed bool, capReached bool, err error) {
	return s.repo.ClaimReward(userID, videoID, DailyVideoCap)
}
