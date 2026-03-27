package physician

import (
"encoding/json"

natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
)

type Service struct {
repo *Repository
nats *natsclient.Client
}

func NewService(repo *Repository, nats *natsclient.Client) *Service {
return &Service{repo: repo, nats: nats}
}

func (s *Service) GetReports(physicianID string, page, pageSize int) ([]Report, int, error) {
return s.repo.GetReports(physicianID, page, pageSize)
}

func (s *Service) GetStats(physicianID string) (*Stats, error) {
return s.repo.GetStats(physicianID)
}

func (s *Service) ReviewReport(reportID, physicianID, action, notes string) error {
if err := s.repo.ReviewReport(reportID, physicianID, action, notes); err != nil {
return err
}
eventData, _ := json.Marshal(map[string]string{
"report_id":    reportID,
"physician_id": physicianID,
"action":       action,
})
_ = s.nats.Publish("physician.review.completed", eventData)
return nil
}
