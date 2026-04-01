package genai

import (
"context"
"database/sql"
"encoding/json"
"log"
"time"

"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
)

type Service struct {
aiProvider ai.AIProvider
db         *sql.DB
nats       *natsclient.Client
notifier   PhysicianNotifier
}

// PhysicianNotifier is satisfied by the WebSocket hub. It is used to push
// real-time newcase events to all connected physician sessions.
type PhysicianNotifier interface {
	Broadcast(event string, data []byte)
}

func NewService(aiProvider ai.AIProvider, db *sql.DB, nats *natsclient.Client) *Service {
return &Service{aiProvider: aiProvider, db: db, nats: nats}
}

// SetPhysicianNotifier wires up the WebSocket hub so that new escalated cases
// are broadcast to all connected physicians in real time.
func (s *Service) SetPhysicianNotifier(n PhysicianNotifier) {
	s.notifier = n
}

type ChatRequest struct {
	Message          string           `json:"message"`
	PreviousMessages []ai.ChatMessage `json:"previousMessages"`
	UserID           string
	Category         string
}

// ChatResponse wraps an AI response with an optional escalation signal.
type ChatResponse struct {
	*ai.AIResponse
	// Escalated is true when a General Health session was auto-promoted to
	// Clinical Diagnosis mode because the AI detected HIGH or CRITICAL urgency.
	Escalated   bool   `json:"escalated,omitempty"`
	// DiagnosisID is the UUID of the diagnosis record saved to the database.
	DiagnosisID string `json:"diagnosisId,omitempty"`
}

// buildSystemPrompt returns the base health prompt augmented with a category-specific snippet.
func buildSystemPrompt(category string) string {
	base := ai.HealthSystemPrompt
	if snippet, ok := ai.CategoryPromptSnippets[category]; ok {
		return base + "\n\n" + snippet
	}
	return base
}

// isEscalationUrgency reports whether the urgency level breaches the risk threshold
// that requires automatic escalation from General Health to Clinical Diagnosis mode.
func isEscalationUrgency(urgency string) bool {
	return urgency == "HIGH" || urgency == "CRITICAL"
}

func (s *Service) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	start := time.Now()

	eventData, _ := json.Marshal(map[string]string{
		"user_id":  req.UserID,
		"message":  req.Message,
		"category": req.Category,
	})
	_ = s.nats.Publish("patient.symptom.submitted", eventData)

	// Limit conversation history to avoid token overflow (keep last 20 messages)
	const maxHistoryMessages = 20
	history := req.PreviousMessages
	if len(history) > maxHistoryMessages {
		history = history[len(history)-maxHistoryMessages:]
	}

	messages := append(history, ai.ChatMessage{Role: "USER", Text: req.Message})
	resp, err := s.aiProvider.Chat(ctx, buildSystemPrompt(req.Category), messages)
	if err != nil {
		return nil, err
	}

	// Latency check — log warning if initial AI call already exceeded 500ms target.
	const latencyTarget = 500 * time.Millisecond
	elapsed := time.Since(start)
	if elapsed > latencyTarget {
		log.Printf("[LATENCY] genai.Chat exceeded target: %dms (category=%s, user=%s)",
			elapsed.Milliseconds(), req.Category, req.UserID)
	}

	// Auto-escalation: promote General Health sessions that breach the risk threshold.
	// Re-runs the AI with the clinical prompt so the response is medically appropriate.
	escalated := false
	if req.Category == "general_health" &&
		resp.Diagnosis != nil &&
		isEscalationUrgency(resp.Diagnosis.Urgency) {

		clinicalResp, clinicalErr := s.aiProvider.Chat(
			ctx,
			buildSystemPrompt("doctor_consultation"),
			messages,
		)
		if clinicalErr == nil {
			resp = clinicalResp
		}
		escalated = true

		escalationData, _ := json.Marshal(map[string]interface{}{
			"user_id":       req.UserID,
			"urgency":       resp.Diagnosis.Urgency,
			"from_category": "general_health",
			"to_category":   "doctor_consultation",
		})
		_ = s.nats.Publish("ai.session.escalated", escalationData)

		// Write escalation event to audit trail.
		s.logAudit(req.UserID, "session.escalated", map[string]interface{}{
			"reason":        "urgency_threshold_breach",
			"urgency":       resp.Diagnosis.Urgency,
			"from_category": "general_health",
			"to_category":   "doctor_consultation",
			"latency_ms":    time.Since(start).Milliseconds(),
		})
	}

	// Log total request latency to audit trail for observability.
	totalLatency := time.Since(start)
	log.Printf("[LATENCY] genai.Chat total: %dms (category=%s, escalated=%v, user=%s)",
		totalLatency.Milliseconds(), req.Category, escalated, req.UserID)

if req.UserID != "" {
if id := s.saveDiagnosis(req.UserID, req.Message, resp, escalated); id != "" {
			if resp.Diagnosis != nil {
				diagData, _ := json.Marshal(map[string]interface{}{
					"user_id":      req.UserID,
					"diagnosis_id": id,
					"diagnosis":    resp.Diagnosis,
					"escalated":    escalated,
				})
				_ = s.nats.Publish("ai.diagnosis.preliminary", diagData)
			}

			// When the case is escalated (HIGH/CRITICAL risk) notify all connected
			// physicians in real time so they can see the new entry in their queue.
			if escalated && s.notifier != nil && resp.Diagnosis != nil {
				casePayload, _ := json.Marshal(map[string]interface{}{
					"caseId":  id,
					"urgency": resp.Diagnosis.Urgency,
					"title":   truncateMsg(req.Message, 80),
				})
				s.notifier.Broadcast("physician.case.new", casePayload)
			}

			return &ChatResponse{AIResponse: resp, Escalated: escalated, DiagnosisID: id}, nil
}
}

if resp.Diagnosis != nil {
diagData, _ := json.Marshal(map[string]interface{}{
"user_id":   req.UserID,
"diagnosis": resp.Diagnosis,
"escalated": escalated,
})
_ = s.nats.Publish("ai.diagnosis.preliminary", diagData)
}

	return &ChatResponse{AIResponse: resp, Escalated: escalated}, nil
}

// saveDiagnosis persists the AI response as a diagnosis record and returns the new UUID.
func (s *Service) saveDiagnosis(userID, message string, resp *ai.AIResponse, escalated bool) string {
aiJSON, _ := json.Marshal(resp)
runes := []rune(message)
title := message
if len(runes) > 100 {
title = string(runes[:100])
}

condition := ""
urgency := ""
if resp.Diagnosis != nil {
condition = resp.Diagnosis.Condition
urgency = resp.Diagnosis.Urgency
}

var id string
_ = s.db.QueryRow(
`INSERT INTO diagnoses (user_id, title, description, condition, urgency, ai_response, status, escalated)
 VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7)
 RETURNING id::text`,
userID, title, resp.Text, condition, urgency, aiJSON, escalated,
).Scan(&id)
return id
}

// logAudit writes a structured event to the audit_logs table.
// action should follow the format "resource.event" (e.g. "session.escalated").
func (s *Service) logAudit(userID, action string, details map[string]interface{}) {
	detailsJSON, _ := json.Marshal(details)
	_, err := s.db.Exec(
		`INSERT INTO audit_logs (user_id, action, resource, details)
		 VALUES ($1::uuid, $2, $3, $4)`,
		userID, action, "genai", detailsJSON,
	)
	if err != nil {
		log.Printf("[AUDIT] failed to write audit log (action=%s, user=%s): %v", action, userID, err)
	}
}

// truncateMsg returns at most n runes from s (for notification previews).
func truncateMsg(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
