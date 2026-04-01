package physician

import (
	"encoding/json"
	"errors"

	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
)

// Broadcaster is satisfied by the WebSocket hub so we can avoid an import cycle.
type Broadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
	Broadcast(event string, data []byte)
}

// CaseQueueResult groups the three queues for the dashboard response.
type CaseQueueResult struct {
	Pending   []CaseQueueItem `json:"pending"`
	Active    []CaseQueueItem `json:"active"`
	Completed []CaseQueueItem `json:"completed"`
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

// GetCaseQueue returns the three-bucket case queue for the physician dashboard.
func (s *Service) GetCaseQueue(physicianID string) (*CaseQueueResult, error) {
	pending, active, completed, err := s.repo.GetCaseQueue(physicianID)
	if err != nil {
		return nil, err
	}
	// Ensure JSON arrays are never null.
	if pending == nil {
		pending = []CaseQueueItem{}
	}
	if active == nil {
		active = []CaseQueueItem{}
	}
	if completed == nil {
		completed = []CaseQueueItem{}
	}
	return &CaseQueueResult{Pending: pending, Active: active, Completed: completed}, nil
}

// TakeCase atomically claims a Pending case (Pending → Active) and locks it to
// the physician.  All connected physicians receive a physician.review.status
// WebSocket event so their queues update in real time.
func (s *Service) TakeCase(caseID, physicianID string) error {
	patientID, err := s.repo.TakeCase(caseID, physicianID)
	if errors.Is(err, ErrCaseNotPending) {
		return ErrCaseNotPending
	}
	if err != nil {
		return err
	}

	// Notify all physicians: queue has changed.
	s.broadcastQueueChange(caseID, physicianID, "Active")

	// Notify the patient their case is being reviewed.
	if patientID != "" && s.broadcaster != nil {
		wsPayload, _ := json.Marshal(map[string]string{
			"diagnosisId": caseID,
			"status":      "Active",
		})
		s.broadcaster.BroadcastToUser(patientID, "diagnosis.update", wsPayload)
	}
	return nil
}

// ReviewReport enforces Pending→Active or Active→Completed transitions.
// On success it publishes NATS physician.review.completed and broadcasts
// WebSocket events to the patient and all physicians.
func (s *Service) ReviewReport(reportID, physicianID, action, notes string) error {
	patientID, err := s.repo.ReviewReport(reportID, physicianID, action, notes)
	if errors.Is(err, ErrCaseNotPending) || errors.Is(err, ErrCaseNotActive) {
		return err
	}
	if err != nil {
		return err
	}

	// NATS: fire physician.review.completed on every review submission.
	natsPayload, _ := json.Marshal(map[string]string{
		"report_id":    reportID,
		"physician_id": physicianID,
		"action":       action,
	})
	_ = s.nats.Publish("physician.review.completed", natsPayload)

	// WebSocket: notify the patient.
	if patientID != "" && s.broadcaster != nil {
		wsPatient, _ := json.Marshal(map[string]string{
			"diagnosisId": reportID,
			"status":      action,
		})
		s.broadcaster.BroadcastToUser(patientID, "diagnosis.update", wsPatient)
	}

	// WebSocket: notify all connected physicians so their queues refresh.
	s.broadcastQueueChange(reportID, physicianID, action)

	return nil
}

// broadcastQueueChange sends a physician.review.status event to all connected
// WebSocket clients (all physicians pick this up via the physician WS hook).
func (s *Service) broadcastQueueChange(caseID, physicianID, status string) {
	if s.broadcaster == nil {
		return
	}
	payload, _ := json.Marshal(map[string]string{
		"caseId":      caseID,
		"physicianId": physicianID,
		"status":      status,
	})
	s.broadcaster.Broadcast("physician.review.status", payload)
}

