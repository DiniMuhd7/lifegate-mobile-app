package im

import (
	"database/sql"
	"time"
)

const postCompletionWindow = 30 * time.Minute

// Service wraps the IM repository with business-logic validation.
type Service struct {
	repo *Repository
}

// NewService creates an IM Service backed by the given database.
func NewService(db *sql.DB) *Service {
	return &Service{repo: NewRepository(db)}
}

// GetMessages returns all messages for a diagnosis, oldest-first.
// Both the patient and the assigned physician are authorised callers; the
// handler layer is responsible for access control.
func (s *Service) GetMessages(diagnosisID string) ([]Message, error) {
	msgs, err := s.repo.ListByDiagnosis(diagnosisID)
	if err != nil {
		return nil, err
	}
	if msgs == nil {
		msgs = []Message{} // always return an array, never null
	}
	return msgs, nil
}

// SendMessage validates the content and persists a new message.
// Patients (senderRole == "user") cannot send messages to a Completed case
// that was completed more than 30 minutes ago.
func (s *Service) SendMessage(diagnosisID, senderID, senderRole, senderName, content string) (*Message, error) {
	if len([]rune(content)) > 2000 {
		return nil, &ValidationError{Field: "content", Message: "message cannot exceed 2000 characters"}
	}
	if senderRole == "user" {
		status, completedAt, err := s.repo.GetCaseCompletion(diagnosisID)
		if err != nil {
			return nil, err
		}
		if status == "Completed" && time.Since(completedAt) > postCompletionWindow {
			return nil, &ValidationError{Field: "case", Message: "This case is closed. Please start a new consultation for further concerns."}
		}
	}
	return s.repo.Create(diagnosisID, senderID, senderRole, senderName, content)
}

// MarkRead stamps all unread messages from the opposite role as read.
func (s *Service) MarkRead(diagnosisID, callerRole string) error {
	return s.repo.MarkRead(diagnosisID, callerRole)
}

// UnreadCount returns the count of unread messages for the calling role.
func (s *Service) UnreadCount(diagnosisID, callerRole string) (int, error) {
	return s.repo.UnreadCount(diagnosisID, callerRole)
}

// GetParticipants returns the patient and physician userIDs for the diagnosis.
func (s *Service) GetParticipants(diagnosisID string) (patientID, physicianID string, err error) {
	return s.repo.GetParticipants(diagnosisID)
}

// ValidationError is returned when user input fails server-side constraints.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Message }
