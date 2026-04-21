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

// fetchLatestHPI retrieves the most recently persisted HPI for the given user
// from the diagnoses table (Fix 5). This allows each EDIS call to carry forward
// the structured symptom profile collected in previous turns rather than
// relying on the AI to reconstruct it from conversational prose.
// Returns nil when no completed HPI record exists for this user.
func (s *Service) fetchLatestHPI(userID string) *ai.SymptomProfile {
	if userID == "" {
		return nil
	}
	var hpiRaw []byte
	err := s.db.QueryRow(`
		SELECT hpi
		FROM diagnoses
		WHERE user_id = $1::uuid
		  AND hpi IS NOT NULL
		  AND status = 'Pending'
		ORDER BY updated_at DESC
		LIMIT 1`, userID,
	).Scan(&hpiRaw)
	if err != nil || len(hpiRaw) == 0 {
		return nil
	}
	var hpi ai.SymptomProfile
	if err := json.Unmarshal(hpiRaw, &hpi); err != nil {
		return nil
	}
	// Only return if at least onset is populated (not a stub object).
	if hpi.Onset == "" {
		return nil
	}
	return &hpi
}

// hpiIsComplete returns true when the minimum three OLDCARTS fields required
// for diagnosis are all present: onset, duration, and severityScore.
func hpiIsComplete(hpi *ai.SymptomProfile) bool {
	if hpi == nil {
		return false
	}
	return hpi.Onset != "" && hpi.Duration != "" && hpi.SeverityScore > 0
}

// ─── Patient context helpers ──────────────────────────────────────────────────

// fetchPatientContext queries the DB for the patient's health profile and
// returns a PatientContext ready for injection into the EDIS system prompt.
// On any error the returned context is a zero value — the AI call still proceeds.
func (s *Service) fetchPatientContext(userID string) edis.PatientContext {
	if userID == "" {
		return edis.PatientContext{}
	}

	var (
		name, dob, gender string
		bloodType, allergies, medicalHistory, currentMedications, genotype sql.NullString
	)
	err := s.db.QueryRow(
		`SELECT COALESCE(name,''), COALESCE(dob,''), COALESCE(gender,''),
		        blood_type, allergies, medical_history, current_medications, genotype
		   FROM users WHERE id = $1`, userID,
	).Scan(&name, &dob, &gender, &bloodType, &allergies, &medicalHistory, &currentMedications, &genotype)
	if err != nil {
		log.Printf("[EDIS] fetchPatientContext: %v", err)
		return edis.PatientContext{}
	}

	return edis.PatientContext{
		Name:               name,
		Age:                ageFromDOB(dob),
		Gender:             gender,
		BloodType:          bloodType.String,
		Genotype:           genotype.String,
		Allergies:          allergies.String,
		MedicalHistory:     medicalHistory.String,
		CurrentMedications: currentMedications.String,
	}
}

// ageFromDOB parses a "YYYY-MM-DD" date of birth and returns the patient's age
// in whole years. Returns 0 if the value is empty or cannot be parsed.
func ageFromDOB(dob string) int {
	if dob == "" {
		return 0
	}
	t, err := time.Parse("2006-01-02", dob)
	if err != nil {
		return 0
	}
	now := time.Now()
	years := now.Year() - t.Year()
	if now.Month() < t.Month() || (now.Month() == t.Month() && now.Day() < t.Day()) {
		years--
	}
	if years < 0 {
		return 0
	}
	return years
}

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
	FollowUpPlan         *ai.FollowUpPlan     `json:"followUpPlan,omitempty"`
	FollowUpDate         string               `json:"followUpDate,omitempty"` // ISO-8601 computed date
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

	history := s.condensHistory(ctx, req.PreviousMessages)

	messages := append(history, ai.ChatMessage{Role: "USER", Text: req.Message})

	patient := s.fetchPatientContext(req.UserID)

	// Carry forward the accumulated HPI from previous turns (Fix 5).
	// This prevents the AI from re-asking for already-collected OLDCARTS fields.
	knownHPI := s.fetchLatestHPI(req.UserID)

	// Process never returns an error — graceful fallback is applied on failure.
	resp, _ := s.engine.Process(ctx, messages, req.Category, patient, knownHPI)

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

	history = s.condensHistory(ctx, history)

	messages := append(history, ai.ChatMessage{Role: "USER", Text: message})

	patient := s.fetchPatientContext(userID)

	// Carry forward any previously collected HPI (Fix 5).
	knownHPI := s.fetchLatestHPI(userID)

	resp, _ := s.engine.Process(ctx, messages, category, patient, knownHPI)

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

	patient := s.fetchPatientContext(userID)

	resp, _ := s.engine.Process(ctx, history, session.Category, patient)

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
		FollowUpPlan:         resp.FollowUpPlan,
		Mode:                 resp.Mode,
		Escalated:            resp.Escalated,
		EscalationTrigger:    resp.EscalationTrigger,
		LowConfidence:        resp.LowConfidence,
		NeedsPhysicianReview: resp.NeedsPhysicianReview,
	}

	// Compute and expose the concrete follow-up date for the client so it can
	// schedule a device calendar event and local notification without extra math.
	if resp.FollowUpPlan != nil && resp.FollowUpPlan.DaysUntil > 0 {
		cr.FollowUpDate = time.Now().UTC().AddDate(0, 0, resp.FollowUpPlan.DaysUntil).Format(time.RFC3339)
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

	// Fix 2 + 4: For clinical and escalated cases, require a minimum viable HPI
	// (onset + duration + severityScore) before persisting a case record or
	// notifying the physician queue. This prevents half-formed cases from appearing
	// in the physician dashboard mid-intake.
	if (resp.Escalated || strings.Contains(strings.ToUpper(resp.Mode), "CLINICAL")) && !hpiIsComplete(resp.HPI) {
		log.Printf("[EDIS] skipping case persistence — HPI incomplete (user=%s mode=%s)", userID, resp.Mode)
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

	// Real-time physician notification for all new Pending cases (not just escalated).
	// Broadcast a lightweight signal so connected physicians can refetch their queue.
	if isNewCase && s.notifier != nil {
		event := "physician.case.new"
		casePayload, _ := json.Marshal(map[string]interface{}{
			"caseId":    id,
			"urgency":   resp.Diagnosis.Urgency,
			"escalated": resp.Escalated,
		})
		s.notifier.Broadcast(event, casePayload)
	}

	return cr, nil
}

// ─── Clinical history condensation ───────────────────────────────────────────

const (
	// summariseThreshold is the number of messages that triggers condensation.
	// When history length exceeds this value, the oldest summariseBatchSize
	// messages are summarised into a single SYSTEM message.
	summariseThreshold = 20

	// summariseBatchSize is the number of oldest messages passed to the
	// summarisation call.  Must be < summariseThreshold.
	summariseBatchSize = 10
)

// condensHistory replaces the oldest summariseBatchSize messages with a single
// SYSTEM-role clinical summary message when len(history) > summariseThreshold.
//
// If the summarisation call fails (provider error, timeout), the function
// degrades gracefully by returning the most recent summariseThreshold messages
// — identical to the old hard-cap behaviour — so EDIS still receives valid input.
//
// When the threshold has not been reached the original slice is returned unchanged.
func (s *Service) condensHistory(ctx context.Context, history []ai.ChatMessage) []ai.ChatMessage {
	if len(history) <= summariseThreshold {
		return history
	}

	batch := history[:summariseBatchSize]
	remaining := history[summariseBatchSize:]

	summary, err := s.engine.Summarize(ctx, batch)
	if err != nil {
		log.Printf("[EDIS] condense: summarisation failed, falling back to truncation: %v", err)
		// Graceful fallback: keep only the most recent summariseThreshold messages.
		return history[len(history)-summariseThreshold:]
	}

	condensed := make([]ai.ChatMessage, 0, 1+len(remaining))
	condensed = append(condensed, ai.ChatMessage{
		Role: "SYSTEM",
		Text: formatClinicalSummaryMessage(summary),
	})
	condensed = append(condensed, remaining...)
	return condensed
}

// formatClinicalSummaryMessage renders a ClinicalSummary as a clearly-labelled
// SYSTEM message body that all EDIS prompts and LLM providers can understand.
func formatClinicalSummaryMessage(s *ai.ClinicalSummary) string {
	var b strings.Builder
	b.WriteString("[CLINICAL CONTEXT SUMMARY — earlier conversation turns condensed by EDIS]\n")
	b.WriteString(s.SummaryText)

	if len(s.ActiveConditions) > 0 {
		b.WriteString("\nActive conditions identified:")
		for _, c := range s.ActiveConditions {
			fmt.Fprintf(&b, "\n  • %s (confidence: %d%%) — %s", c.Condition, c.Confidence, c.Description)
		}
	}

	if len(s.Flags) > 0 {
		b.WriteString("\nRisk flags:")
		for _, f := range s.Flags {
			fmt.Fprintf(&b, "\n  • [%s/%s] %s", f.Flag, f.Severity, f.Description)
		}
	}

	b.WriteString("\n[END SUMMARY — conversation continues below]")
	return b.String()
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

func (s *Service) saveDiagnosis(userID, message string, resp *ai.AIResponse, escalated bool) (string, bool) {
	aiJSON, _ := json.Marshal(resp)

	// Marshal HPI separately for the dedicated hpi column.
	// json.Marshal on nil produces "null" which PostgreSQL stores as SQL NULL
	// when the column type is JSONB — that is acceptable.
	var hpiJSON []byte
	if resp.HPI != nil {
		hpiJSON, _ = json.Marshal(resp.HPI)
	}

	// Compute follow-up date and instructions from the AI's followUpPlan.
	// follow_up_date is stored as a TIMESTAMPTZ; instructions list the trigger
	// symptoms the patient should watch for before that date.
	var followUpDate *time.Time
	var followUpInstructions string
	if resp.FollowUpPlan != nil && resp.FollowUpPlan.DaysUntil > 0 {
		t := time.Now().UTC().AddDate(0, 0, resp.FollowUpPlan.DaysUntil)
		followUpDate = &t
		if len(resp.FollowUpPlan.TriggerSymptoms) > 0 {
			followUpInstructions = "Seek care immediately if you experience: " +
				strings.Join(resp.FollowUpPlan.TriggerSymptoms, ", ") + "."
		}
	}

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
			hasPrescription := resp.Prescription != nil
			_, updateErr := s.db.Exec(`
				UPDATE diagnoses
				SET title                 = $2,
				    description           = $3,
				    condition             = $4,
				    urgency               = $5,
				    ai_response           = $6,
				    hpi                   = $7,
				    escalated             = $8,
				    has_prescription      = $9,
				    follow_up_date        = $10,
				    follow_up_instructions = $11,
				    updated_at            = NOW()
				WHERE id = $1::uuid`,
				existingID, title, resp.Text, condition, urgency, aiJSON, hpiJSON, escalated, hasPrescription,
				followUpDate, followUpInstructions,
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
	hasPrescription := resp.Prescription != nil
	var id string
	_ = s.db.QueryRow(
		`INSERT INTO diagnoses
		   (user_id, title, description, condition, urgency, ai_response, hpi,
		    status, escalated, has_prescription, follow_up_date, follow_up_instructions)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9, $10, $11)
		 RETURNING id::text`,
		userID, title, resp.Text, condition, urgency, aiJSON, hpiJSON, escalated, hasPrescription,
		followUpDate, followUpInstructions,
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
