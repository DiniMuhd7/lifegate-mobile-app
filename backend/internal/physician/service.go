package physician

import (
"encoding/json"

natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
)

// Broadcaster is satisfied by the WebSocket hub so we can avoid an import cycle.
type Broadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
}

type Service struct {
repo        *Repository
nats        *natsclient.Client
broadcaster Broadcaster
}

func NewService(repo *Repository, nats *natsclient.Client, broadcaster Broadcaster) *Service {
return &Service{repo: repo, nats: nats, broadcaster: broadcaster}
}

func (s *Service) GetReports(physicianID string, page, pageSize int) ([]Report, int, error) {
return s.repo.GetReports(physicianID, page, pageSize)
}

func (s *Service) GetStats(physicianID string) (*Stats, error) {
return s.repo.GetStats(physicianID)
}

func (s *Service) ReviewReport(reportID, physicianID, action, notes string) error {
patientID, err := s.repo.ReviewReport(reportID, physicianID, action, notes)
if err != nil {
return err
}
eventData, _ := json.Marshal(map[string]string{
"report_id":    reportID,
"physician_id": physicianID,
"action":       action,
})
_ = s.nats.Publish("physician.review.completed", eventData)

// Push real-time status update to the patient via WebSocket.
if patientID != "" && s.broadcaster != nil {
	wsPayload, _ := json.Marshal(map[string]string{
		"diagnosisId": reportID,
		"status":      action,
	})
	s.broadcaster.BroadcastToUser(patientID, "diagnosis.update", wsPayload)
}
return nil
}
