package physician

import (
	"context"
	"encoding/json"
	"errors"

	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
)

// Broadcaster is satisfied by the WebSocket hub so we can avoid an import cycle.
type Broadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
	Broadcast(event string, data []byte)
}

// PushNotifier can deliver push notifications to any user (patient or physician).
// The notifications.Service satisfies this interface.
type PushNotifier interface {
	SendToUser(ctx context.Context, userID, title, body string, data map[string]string)
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
	push        PushNotifier // optional — set with SetPushNotifier
}

func NewService(repo *Repository, nats *natsclient.Client, broadcaster Broadcaster) *Service {
	return &Service{repo: repo, nats: nats, broadcaster: broadcaster}
}

// SetPushNotifier wires in a push notification sender for patient notifications.
func (s *Service) SetPushNotifier(p PushNotifier) { s.push = p }

func (s *Service) GetReports(physicianID string, page, pageSize int) ([]Report, int, error) {
	return s.repo.GetReports(physicianID, page, pageSize)
}

func (s *Service) GetStats(physicianID string) (*Stats, error) {
	return s.repo.GetStats(physicianID)
}

// GetCaseDetail fetches the full case record for review, including parsed AI output.
func (s *Service) GetCaseDetail(caseID, physicianID string) (*CaseDetail, error) {
	return s.repo.GetCaseDetail(caseID, physicianID)
}

// GetPatientProfile fetches a patient's health profile by user ID.
func (s *Service) GetPatientProfile(patientID string) (*PatientProfile, error) {
	return s.repo.GetPatientProfile(patientID)
}

// UpdateAIOutput lets a physician correct the AI-generated fields inline
// while the case is in Active status.
func (s *Service) UpdateAIOutput(caseID, physicianID, condition, urgency string, confidence int) error {
	return s.repo.UpdateAIOutput(caseID, physicianID, condition, urgency, confidence)
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
// On success it publishes NATS physician.review.completed, broadcasts WebSocket
// events to the patient and all physicians, and sends a push notification to
// the patient when the case is completed.
func (s *Service) ReviewReport(reportID, physicianID string, input ReviewInput) error {
	patientID, err := s.repo.ReviewReport(reportID, physicianID, input)
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
		"action":       input.Action,
		"decision":     input.PhysicianDecision,
	})
	_ = s.nats.Publish("physician.review.completed", natsPayload)

	// WebSocket: notify the patient.
	if patientID != "" && s.broadcaster != nil {
		wsPatient, _ := json.Marshal(map[string]string{
			"diagnosisId": reportID,
			"status":      input.Action,
			"decision":    input.PhysicianDecision,
		})
		s.broadcaster.BroadcastToUser(patientID, "diagnosis.update", wsPatient)
	}

	// Push notification to patient on case completion.
	if s.push != nil && patientID != "" && input.Action == "Completed" {
		title := "Case Review Complete"
		body := "Your health report has been reviewed by a physician."
		switch input.PhysicianDecision {
		case "Approved":
			body = "Good news! A physician has approved your AI diagnosis."
		case "Rejected":
			body = "A physician has reviewed and updated your health report. Check the app for details."
		}
		s.push.SendToUser(context.Background(), patientID, title, body,
			map[string]string{"diagnosisId": reportID, "decision": input.PhysicianDecision})
	}

	// WebSocket: notify all connected physicians so their queues refresh.
	s.broadcastQueueChange(reportID, physicianID, input.Action)

	// Credit an earnings record when the physician approves the case.
	if input.PhysicianDecision == "Approved" {
		if creditErr := s.repo.CreditEarning(physicianID, reportID); creditErr != nil {
			// Non-fatal: log and continue — the case review itself succeeded.
			_ = creditErr
		}
	}

	return nil
}

// GetEarningsSummary returns the aggregated earnings dashboard for a physician.
func (s *Service) GetEarningsSummary(physicianID string) (*EarningsSummary, error) {
	return s.repo.GetEarningsSummary(physicianID)
}

// GetEarningsHistory returns paginated per-case earnings history.
func (s *Service) GetEarningsHistory(physicianID string, page, pageSize int) ([]EarningRecord, int, error) {
	return s.repo.GetEarningsHistory(physicianID, page, pageSize)
}

// GetPayouts returns all payout records for the physician.
func (s *Service) GetPayouts(physicianID string) ([]Payout, error) {
	return s.repo.GetPayouts(physicianID)
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

