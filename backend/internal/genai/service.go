package genai

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sessions"
	"github.com/lib/pq"
)

// ─── Service ──────────────────────────────────────────────────────────────────

type Service struct {
	engine   *edis.Engine
	db       *sql.DB
	nats     *natsclient.Client
	sessions *sessions.Service
	notifier PhysicianNotifier
}

// PhysicianNotifier is satisfied by the WebSocket hub. It is used to push
// real-time case events to all connected physician sessions.
type PhysicianNotifier interface {
	Broadcast(event string, data []byte)
}

// NewService creates a genai Service backed by an EDIS engine.
func NewService(engine *edis.Engine, db *sql.DB, nats *natsclient.Client, sessions *sessions.Service) *Service {
	return &Service{engine: engine, db: db, nats: nats, sessions: sessions}
}

// SetPhysicianNotifier wires up the WebSocket hub so that escalated cases
// are broadcast to all connected physicians in real time.
func (s *Service) SetPhysicianNotifier(n PhysicianNotifier) {
	s.notifier = n
}

// ─── Request / Response types ─────────────────────────────────────────────────

type ChatRequest struct {
	Message          string           `json:"message"`
	PreviousMessages []ai.ChatMessage `json:"previousMessages"`
	UserID           string
	Category         string
}

// ChatResponse is the full EDIS-powered response returned to the client.
type ChatResponse struct {
	Text                 string               `json:"text"`
	Diagnosis            *ai.Diagnosis        `json:"diagnosis,omitempty"`
	Prescription         *ai.Prescription     `json:"prescription,omitempty"`
	Conditions           []ai.ConditionScore  `json:"conditions,omitempty"`
	FollowUpQuestions    []string             `json:"followUpQuestions,omitempty"`
	RiskFlags            []ai.RiskFlag        `json:"riskFlags,omitempty"`
	Investigations       []ai.Investigation   `json:"investigations,omitempty"`
	Mode                 string               `json:"mode"`
	Escalated            bool                 `json:"escalated,omitempty"`
	EscalationTrigger    string               `json:"escalationTrigger,omitempty"`
	LowConfidence        bool                 `json:"lowConfidence,omitempty"`
	NeedsPhysicianReview bool                 `json:"needsPhysicianReview,omitempty"`
	DiagnosisID          string               `json:"diagnosisId,omitempty"`
	// IsExistingCase is true when diagnosisId refers to a previously created case
	// (i.e. the new symptoms matched an existing Pending case for this user).
	// The client uses this to present a "Continuing existing case" UI state.
	IsExistingCase       bool                 `json:"isExistingCase,omitempty"`
}

// FinalizeResult is the structured result of finalizing a session.
type FinalizeResult struct {
	DiagnosisID string              `json:"diagnosisId"`
	Summary     string              `json:"summary"`
	Conditions  []ai.ConditionScore `json:"conditions,omitempty"`
	RiskFlags   []ai.RiskFlag       `json:"riskFlags,omitempty"`
	Mode        string              `json:"mode"`
}

// ─── Chat (stateless — backward-compatible) ───────────────────────────────────

// Chat processes a single AI interaction without persisting a session.
// The EDIS engine applies timeout, graceful fallback, escalation, and risk-flag logic.
func (s *Service) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	start := time.Now()

	eventData, _ := json.Marshal(map[string]string{
		"user_id":  req.UserID,
		"message":  req.Message,
		"category": req.Category,
	})
	_ = s.nats.Publish("patient.symptom.submitted", eventData)

	const maxHistory = 20
	history := req.PreviousMessages
	if len(history) > maxHistory {
		history = history[len(history)-maxHistory:]
	}

	messages := append(history, ai.ChatMessage{Role: "USER", Text: req.Message})

	// Process never returns an error — graceful fallback is applied on failure.
	resp, _ := s.engine.Process(ctx, messages, req.Category)

	return s.buildAndPublish(ctx, req.UserID, req.Message, resp, start)
}

// ─── ChatInSession (session-scoped) ──────────────────────────────────────────

// ChatInSession appends a user message to an existing session, calls EDIS, and
// persists the AI reply back to the session's message history.
func (s *Service) ChatInSession(ctx context.Context, sessionID, userID, message, category string) (*ChatResponse, error) {
	start := time.Now()

	session, err := s.sessions.Get(ctx, sessionID, userID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	var history []ai.ChatMessage
	if len(session.Messages) > 0 && string(session.Messages) != "null" {
		if parseErr := json.Unmarshal(session.Messages, &history); parseErr != nil {
			log.Printf("[EDIS] failed to parse session messages (id=%s): %v", sessionID, parseErr)
			history = nil
		}
	}

	const maxHistory = 20
	if len(history) > maxHistory {
		history = history[len(history)-maxHistory:]
	}

	messages := append(history, ai.ChatMessage{Role: "USER", Text: message})

	resp, _ := s.engine.Process(ctx, messages, category)

	// Persist the full conversation (user + AI turn) back to the session.
	messages = append(messages, ai.ChatMessage{Role: "ASSISTANT", Text: resp.Text})
	messagesJSON, _ := json.Marshal(messages)
	activeStatus := "active"
	if _, updateErr := s.sessions.Update(ctx, sessionID, userID, sessions.UpdateInput{
		Messages: messagesJSON,
		Status:   &activeStatus,
	}); updateErr != nil {
		log.Printf("[EDIS] failed to update session messages (id=%s): %v", sessionID, updateErr)
	}

	_ = s.nats.Publish("patient.symptom.submitted", func() []byte {
		b, _ := json.Marshal(map[string]string{
			"user_id":    userID,
			"session_id": sessionID,
			"message":    message,
			"category":   category,
		})
		return b
	}())

	return s.buildAndPublish(ctx, userID, message, resp, start)
}

// ─── FinalizeSession ──────────────────────────────────────────────────────────

// FinalizeSession generates a comprehensive final report for a session, saves a
// diagnosis record, and marks the session as completed.
func (s *Service) FinalizeSession(ctx context.Context, sessionID, userID string) (*FinalizeResult, error) {
	session, err := s.sessions.Get(ctx, sessionID, userID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	var history []ai.ChatMessage
	if len(session.Messages) > 0 && string(session.Messages) != "null" {
		_ = json.Unmarshal(session.Messages, &history)
	}

	// Append a finalization instruction so EDIS produces a comprehensive summary.
	history = append(history, ai.ChatMessage{
		Role: "USER",
		Text: "Please provide a comprehensive final health assessment summary based on our entire conversation. " +
			"Include the most probable conditions with confidence scores, any risk flags detected, " +
			"and recommendations for follow-up care.",
	})

	resp, _ := s.engine.Process(ctx, history, session.Category)

	// Final reports always enter the physician review queue.
	diagnosisID, _ := s.saveDiagnosis(userID, "Session Summary: "+session.Title, resp.AIResponse, resp.Escalated)

	// Mark the session completed.
	completedStatus := "completed"
	if _, updateErr := s.sessions.Update(ctx, sessionID, userID, sessions.UpdateInput{
		Status: &completedStatus,
	}); updateErr != nil {
		log.Printf("[EDIS] failed to mark session completed (id=%s): %v", sessionID, updateErr)
	}

	if diagnosisID != "" {
		diagData, _ := json.Marshal(map[string]interface{}{
			"user_id":      userID,
			"session_id":   sessionID,
			"diagnosis_id": diagnosisID,
			"diagnosis":    resp.Diagnosis,
			"conditions":   resp.Conditions,
			"escalated":    resp.Escalated,
		})
		_ = s.nats.Publish("ai.diagnosis.preliminary", diagData)
	}

	return &FinalizeResult{
		DiagnosisID: diagnosisID,
		Summary:     resp.Text,
		Conditions:  resp.Conditions,
		RiskFlags:   resp.RiskFlags,
		Mode:        resp.Mode,
	}, nil
}

// ─── HealthCheck / Status ─────────────────────────────────────────────────────

// HealthCheck pings the AI provider. Returns nil on success, error on failure.
// Callers should return HTTP 503 on error.
func (s *Service) HealthCheck(ctx context.Context) error {
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.engine.Ping(pingCtx)
}

// Status returns the current provider name and service status.
func (s *Service) Status() map[string]string {
	return map[string]string{
		"provider": s.engine.ProviderName(),
		"status":   "ready",
	}
}

// ─── Shared response builder ──────────────────────────────────────────────────

// buildAndPublish converts an EDISResponse into a ChatResponse and publishes
// the appropriate NATS events (ai.question.generated, early_flag.detected,
// ai.session.escalated, ai.diagnosis.preliminary).
func (s *Service) buildAndPublish(ctx context.Context, userID, message string, resp *edis.EDISResponse, start time.Time) (*ChatResponse, error) {
	cr := &ChatResponse{
		Text:                 resp.Text,
		Diagnosis:            resp.Diagnosis,
		Prescription:         resp.Prescription,
		Conditions:           resp.Conditions,
		FollowUpQuestions:    resp.FollowUpQuestions,
		RiskFlags:            resp.RiskFlags,
		Investigations:       resp.Investigations,
		Mode:                 resp.Mode,
		Escalated:            resp.Escalated,
		EscalationTrigger:    resp.EscalationTrigger,
		LowConfidence:        resp.LowConfidence,
		NeedsPhysicianReview: resp.NeedsPhysicianReview,
	}

	// ai.question.generated — published whenever EDIS surfaces follow-up questions.
	if len(resp.FollowUpQuestions) > 0 {
		qData, _ := json.Marshal(map[string]interface{}{
			"user_id":   userID,
			"questions": resp.FollowUpQuestions,
		})
		_ = s.nats.Publish("ai.question.generated", qData)
	}

	// early_flag.detected — published when early-stage risk signals are present.
	if len(resp.RiskFlags) > 0 {
		flagData, _ := json.Marshal(map[string]interface{}{
			"user_id":    userID,
			"risk_flags": resp.RiskFlags,
		})
		_ = s.nats.Publish("early_flag.detected", flagData)
	}

	// ai.session.escalated — published on General → Clinical escalation.
	if resp.Escalated {
		escalationData, _ := json.Marshal(map[string]interface{}{
			"user_id":            userID,
			"escalation_trigger": resp.EscalationTrigger,
			"needs_review":       resp.NeedsPhysicianReview,
		})
		_ = s.nats.Publish("ai.session.escalated", escalationData)
		s.logAudit(userID, "session.escalated", map[string]interface{}{
			"reason":     resp.EscalationTrigger,
			"latency_ms": time.Since(start).Milliseconds(),
		})
	}

	log.Printf("[EDIS] complete: %dms (escalated=%v lowConf=%v needsReview=%v user=%s)",
		time.Since(start).Milliseconds(), resp.Escalated, resp.LowConfidence, resp.NeedsPhysicianReview, userID)

	if userID == "" || resp.Diagnosis == nil {
		return cr, nil
	}

	// Persist diagnosis and publish ai.diagnosis.preliminary.
	id, isNewCase := s.saveDiagnosis(userID, message, resp.AIResponse, resp.Escalated)
	if id == "" {
		return cr, nil
	}

	cr.DiagnosisID = id
	cr.IsExistingCase = !isNewCase

	diagData, _ := json.Marshal(map[string]interface{}{
		"user_id":      userID,
		"diagnosis_id": id,
		"diagnosis":    resp.Diagnosis,
		"conditions":   resp.Conditions,
		"escalated":    resp.Escalated,
		"is_new_case":  isNewCase,
	})
	_ = s.nats.Publish("ai.diagnosis.preliminary", diagData)

	// Real-time physician notification for escalated / high-risk cases.
	// Use different events for new cases vs. updated existing cases so the
	// physician queue can handle them appropriately.
	if resp.Escalated && s.notifier != nil {
		event := "physician.case.updated"
		if isNewCase {
			event = "physician.case.new"
		}
		casePayload, _ := json.Marshal(map[string]interface{}{
			"caseId":  id,
			"urgency": resp.Diagnosis.Urgency,
			"title":   truncateMsg(message, 80),
			"isNew":   isNewCase,
		})
		s.notifier.Broadcast(event, casePayload)
	}

	return cr, nil
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

func (s *Service) saveDiagnosis(userID, message string, resp *ai.AIResponse, escalated bool) (string, bool) {
	aiJSON, _ := json.Marshal(resp)

	// Use the AI's top condition as the case title — this is the "possible condition"
	// shown to the patient in their dashboard. Fall back to a truncated message excerpt.
	title := ""
	if resp.Diagnosis != nil && resp.Diagnosis.Condition != "" {
		title = resp.Diagnosis.Condition
	} else {
		runes := []rune(message)
		title = message
		if len(runes) > 100 {
			title = string(runes[:100])
		}
	}

	condition, urgency := "", ""
	if resp.Diagnosis != nil {
		condition = resp.Diagnosis.Condition
		urgency = resp.Diagnosis.Urgency
	}

	// ── Duplicate detection ────────────────────────────────────────────────────
	// Build a normalised set of all possible condition names from this AI
	// response (primary diagnosis + every entry in 'conditions' array).
	// We match against any existing Pending case whose stored conditions overlap
	// with ours — either via the top-level 'condition' column or the JSONB
	// 'conditions' array in ai_response. This prevents the dashboard from filling
	// up with redundant entries whenever the user continues describing the same
	// complaint across multiple messages.
	var condNames []string
	if condition != "" {
		condNames = append(condNames, strings.ToLower(condition))
	}
	for _, cs := range resp.Conditions {
		if cs.Condition != "" {
			condNames = append(condNames, strings.ToLower(cs.Condition))
		}
	}

	if len(condNames) > 0 {
		var existingID string
		lookupErr := s.db.QueryRow(`
			SELECT id::text
			FROM diagnoses
			WHERE user_id   = $1::uuid
			  AND status    = 'Pending'
			  AND created_at > NOW() - INTERVAL '30 days'
			  AND (
			        LOWER(COALESCE(condition,'')) = ANY($2)
			        OR EXISTS (
			            SELECT 1
			            FROM jsonb_array_elements(
			                     COALESCE(ai_response->'conditions', '[]'::jsonb)
			                 ) AS c
			            WHERE LOWER(c->>'condition') = ANY($2)
			        )
			  )
			ORDER BY created_at DESC
			LIMIT 1`,
			userID, pq.Array(condNames),
		).Scan(&existingID)

		if lookupErr == nil && existingID != "" {
			// Update the existing case with the latest AI output (new symptoms
			// may have refined the diagnosis, urgency, or prescription details).
			_, updateErr := s.db.Exec(`
				UPDATE diagnoses
				SET title       = $2,
				    description = $3,
				    condition   = $4,
				    urgency     = $5,
				    ai_response = $6,
				    escalated   = $7,
				    updated_at  = NOW()
				WHERE id = $1::uuid`,
				existingID, title, resp.Text, condition, urgency, aiJSON, escalated,
			)
			if updateErr != nil {
				log.Printf("[EDIS] failed to update existing case %s: %v", existingID, updateErr)
			} else {
				log.Printf("[EDIS] reusing existing case %s (matched conditions: %v user=%s)", existingID, condNames, userID)
				return existingID, false
			}
		}
	}

	// ── Insert new case ────────────────────────────────────────────────────────
	var id string
	_ = s.db.QueryRow(
		`INSERT INTO diagnoses (user_id, title, description, condition, urgency, ai_response, status, escalated)
		 VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7)
		 RETURNING id::text`,
		userID, title, resp.Text, condition, urgency, aiJSON, escalated,
	).Scan(&id)
	return id, true
}

func (s *Service) logAudit(userID, action string, details map[string]interface{}) {
	detailsJSON, _ := json.Marshal(details)
	if _, err := s.db.Exec(
		`INSERT INTO audit_logs (user_id, action, resource, details)
		 VALUES ($1::uuid, $2, $3, $4)`,
		userID, action, "genai", detailsJSON,
	); err != nil {
		log.Printf("[AUDIT] failed to write log (action=%s user=%s): %v", action, userID, err)
	}
}

func truncateMsg(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
