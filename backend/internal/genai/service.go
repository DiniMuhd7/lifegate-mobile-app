package genai

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
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

// hpiIsComplete returns true only when all five OLDCARTS intake fields are
// present. This is the server-side bar for persisting a diagnosis case.
func hpiIsComplete(hpi *ai.SymptomProfile) bool {
	if hpi == nil {
		return false
	}
	return hpi.Onset != "" &&
		hpi.Duration != "" &&
		hpi.SeverityScore > 0 &&
		hpi.Location != "" &&
		hpi.Character != ""
}

func isClinicalDiagnosisCategory(category string) bool {
	return strings.EqualFold(strings.TrimSpace(category), "clinical_diagnosis")
}

// enforceCategoryOutputPolicy makes request category the server-side source of truth.
// Unless the request is explicitly clinical_diagnosis, strip all clinical fields
// so no client can receive diagnosis/test outputs while in non-clinical mode.
func enforceCategoryOutputPolicy(resp *edis.EDISResponse, category string) {
	if resp == nil || isClinicalDiagnosisCategory(category) {
		return
	}

	resp.Mode = "general"
	resp.Diagnosis = nil
	resp.Prescription = nil
	resp.Conditions = nil
	resp.RiskFlags = nil
	resp.Investigations = nil
	resp.FollowUpPlan = nil
	// Escalated / EscalationTrigger are intentionally preserved so the frontend
	// can prompt the user to upgrade to Clinical mode when EDIS detects a
	// threshold breach — even while the session is still in general_health mode.
	// They carry no clinical content (PHI), so preserving them is safe.
	resp.LowConfidence = false
	resp.NeedsPhysicianReview = false
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
		name, dob, gender, language string
		bloodType, allergies, medicalHistory, currentMedications, genotype sql.NullString
		state, country sql.NullString
	)
	err := s.db.QueryRow(
		`SELECT COALESCE(name,''), COALESCE(dob,''), COALESCE(gender,''), COALESCE(language,''),
		        blood_type, allergies, medical_history, current_medications, genotype,
		        state, country
		   FROM users WHERE id = $1`, userID,
	).Scan(&name, &dob, &gender, &language, &bloodType, &allergies, &medicalHistory, &currentMedications, &genotype,
		&state, &country)
	if err != nil {
		log.Printf("[EDIS] fetchPatientContext: %v", err)
		return edis.PatientContext{}
	}

	// Determine which health profile fields are still missing so EDIS can
	// collect them naturally during triage.
	var missingFields []string
	if bloodType.String == "" {
		missingFields = append(missingFields, `blood type (e.g. O+, A-, B+, AB+; or 'Unknown')`)
	}
	if genotype.String == "" {
		missingFields = append(missingFields, `genotype (e.g. AA, AS, SS, SC, AC; or 'Unknown')`)
	}
	if allergies.String == "" {
		missingFields = append(missingFields, `known drug or food allergies (or 'None' if none)`)
	}
	if medicalHistory.String == "" {
		missingFields = append(missingFields, `pre-existing medical conditions (or 'None' if none)`)
	}
	if currentMedications.String == "" {
		missingFields = append(missingFields, `current medications (or 'None' if not currently taking any)`)
	}

	return edis.PatientContext{
		Name:                 name,
		Age:                  ageFromDOB(dob),
		Gender:               gender,
		Language:             language,
		BloodType:            bloodType.String,
		Genotype:             genotype.String,
		Allergies:            allergies.String,
		MedicalHistory:       medicalHistory.String,
		CurrentMedications:   currentMedications.String,
		State:                state.String,
		Country:              country.String,
		MissingProfileFields: missingFields,
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

// normalizeBloodType canonicalises a blood type string to one of the eight
// accepted values (A+, A-, B+, B-, AB+, AB-, O+, O-). Returns empty string
// if the input cannot be resolved.
func normalizeBloodType(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "POSITIVE", "+")
	s = strings.ReplaceAll(s, "NEGATIVE", "-")
	s = strings.ReplaceAll(s, " ", "")
	valid := map[string]bool{
		"A+": true, "A-": true, "B+": true, "B-": true,
		"AB+": true, "AB-": true, "O+": true, "O-": true,
	}
	if valid[s] {
		return s
	}
	return ""
}

// normalizeGenotype canonicalises a genotype string to one of the five
// accepted values (AA, AS, SS, SC, AC). Returns empty string if invalid.
func normalizeGenotype(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	valid := map[string]bool{"AA": true, "AS": true, "SS": true, "SC": true, "AC": true}
	if valid[s] {
		return s
	}
	return ""
}

// saveProfileUpdate persists any health profile fields collected by EDIS during
// triage to the users table. Only non-empty, validated values are written.
// This is a best-effort fire-and-continue — errors are logged but not returned.
func (s *Service) saveProfileUpdate(ctx context.Context, userID string, u *ai.ProfileUpdate) bool {
	if u == nil || userID == "" {
		return false
	}

	var setClauses []string
	var args []interface{}
	args = append(args, userID) // $1 always = userID
	argIdx := 2

	if bt := normalizeBloodType(u.BloodType); bt != "" {
		setClauses = append(setClauses, fmt.Sprintf("blood_type = $%d", argIdx))
		args = append(args, bt)
		argIdx++
	}
	if gt := normalizeGenotype(u.Genotype); gt != "" {
		setClauses = append(setClauses, fmt.Sprintf("genotype = $%d", argIdx))
		args = append(args, gt)
		argIdx++
	}
	if al := strings.TrimSpace(u.Allergies); al != "" {
		setClauses = append(setClauses, fmt.Sprintf("allergies = $%d", argIdx))
		args = append(args, al)
		argIdx++
	}
	if mh := strings.TrimSpace(u.MedicalHistory); mh != "" {
		setClauses = append(setClauses, fmt.Sprintf("medical_history = $%d", argIdx))
		args = append(args, mh)
		argIdx++
	}
	if cm := strings.TrimSpace(u.CurrentMedications); cm != "" {
		setClauses = append(setClauses, fmt.Sprintf("current_medications = $%d", argIdx))
		args = append(args, cm)
		// argIdx++ (not needed after last field)
	}

	if len(setClauses) == 0 {
		return false
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	query := fmt.Sprintf("UPDATE users SET %s WHERE id = $1::uuid", strings.Join(setClauses, ", "))
	_, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		log.Printf("[EDIS] saveProfileUpdate failed (user=%s): %v", userID, err)
		return false
	}
	log.Printf("[EDIS] saveProfileUpdate: persisted %d profile field(s) for user=%s", len(setClauses)-1, userID)
	return true
}

// ─── Service ──────────────────────────────────────────────────────────────────

type Service struct {
	engine     *edis.Engine
	db         *sql.DB
	nats       *natsclient.Client
	sessions   *sessions.Service
	notifier   PhysicianNotifier
	physPush   PhysicianPushBroadcaster
	openAIKey  string
}

// PhysicianNotifier is satisfied by the WebSocket hub. It is used to push
// real-time case events to all connected physician sessions.
type PhysicianNotifier interface {
	Broadcast(event string, data []byte)
}

// PhysicianPushBroadcaster delivers Expo push notifications to every physician
// that currently has a push token registered.  notifications.Service satisfies
// this interface.
type PhysicianPushBroadcaster interface {
	BroadcastToAllPhysicians(ctx context.Context, title, body string, data map[string]string)
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

// SetPhysicianPushBroadcaster wires up the push notification service so that
// escalated cases trigger a push to all physicians with a registered token.
func (s *Service) SetPhysicianPushBroadcaster(b PhysicianPushBroadcaster) {
	s.physPush = b
}

// SetOpenAIKey stores the OpenAI API key used for Whisper and Vision APIs.
func (s *Service) SetOpenAIKey(key string) {
	s.openAIKey = key
}

// ScanMedicalImage sends a base64-encoded image to OpenAI Vision (gpt-4o) for
// real-time OCR extraction. It returns the extracted text and a flag indicating
// whether the image was identified as a medical document. The image data is
// processed entirely in memory — it is never written to any storage.
func (s *Service) ScanMedicalImage(ctx context.Context, imageBase64, mimeType string) (text string, isMedical bool, err error) {
	if s.openAIKey == "" {
		return "", false, fmt.Errorf("OpenAI API key is not configured")
	}

	const systemPrompt = `You are a medical document OCR assistant. Examine the provided image carefully.

If the image is NOT a medical or health-related document (e.g. a selfie, food photo, landscape, random screenshot, or any non-clinical content), respond with exactly: NOT_MEDICAL

If the image IS a medical or health-related document — such as lab results, blood panel, urine analysis, prescription, medication packaging, X-ray or imaging report, doctor's notes, medical certificate, ECG/EKG, ultrasound report, pathology report, discharge summary, or any clinical document — extract ALL text and structured information using this format:

Document Type: <type>
Date: <date if visible>
---
<All extracted text, preserving structure, numerical values, units, reference ranges, and clinical annotations>
---

Be thorough, accurate, and preserve all medical terminology.`

	reqBody := map[string]any{
		"model":      "gpt-4o",
		"max_tokens": 2000,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "text",
						"text": systemPrompt,
					},
					{
						"type": "image_url",
						"image_url": map[string]string{
							"url":    fmt.Sprintf("data:%s;base64,%s", mimeType, imageBase64),
							"detail": "high",
						},
					},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", false, fmt.Errorf("marshalling vision request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.openai.com/v1/chat/completions",
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		return "", false, fmt.Errorf("building vision request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.openAIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", false, fmt.Errorf("vision API request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", false, fmt.Errorf("reading vision response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("vision API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err = json.Unmarshal(respBody, &result); err != nil {
		return "", false, fmt.Errorf("parsing vision response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", false, fmt.Errorf("empty response from vision API")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	if strings.EqualFold(content, "NOT_MEDICAL") {
		return "", false, nil
	}
	return content, true, nil
}

// TranscribeAudio sends raw audio bytes to OpenAI Whisper and returns the
// transcribed text. Audio data is never written to disk on the server — it is
// streamed directly to the Whisper API in a multipart POST body.
func (s *Service) TranscribeAudio(ctx context.Context, audioData []byte, filename, contentType string) (string, error) {
	if s.openAIKey == "" {
		return "", fmt.Errorf("OpenAI API key is not configured")
	}
	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data is empty")
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	_ = mw.WriteField("model", "whisper-1")
	_ = mw.WriteField("language", "en")
	_ = mw.WriteField("response_format", "json")

	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("creating form file: %w", err)
	}
	if _, err = part.Write(audioData); err != nil {
		return "", fmt.Errorf("writing audio data: %w", err)
	}
	if err = mw.Close(); err != nil {
		return "", fmt.Errorf("closing multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.openai.com/v1/audio/transcriptions",
		&body,
	)
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.openAIKey)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("whisper API request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading whisper response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("whisper API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Text string `json:"text"`
	}
	if err = json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parsing whisper response: %w", err)
	}
	return strings.TrimSpace(result.Text), nil
}

// ─── Request / Response types ─────────────────────────────────────────────────

type ChatRequest struct {
	Message          string           `json:"message"`
	PreviousMessages []ai.ChatMessage `json:"previousMessages"`
	UserID           string
	Category         string
	// ContinuationDiagnosisID is the active case ID sent by the client when
	// triage continues on an already-open case.
	ContinuationDiagnosisID string
}

// ChatResponse is the full EDIS-powered response returned to the client.
type ChatResponse struct {
	Text                 string               `json:"text"`
	Diagnosis            *ai.Diagnosis        `json:"diagnosis,omitempty"`
	// Prescription is intentionally never serialised to the patient client.
	// The raw medication data is stored server-side and released only after a
	// physician approves the case (status=Completed, physicianDecision=Approved).
	// Clients use HasPrescription to show a locked "pending approval" placeholder.
	Prescription         *ai.Prescription     `json:"-"`
	// HasPrescription is true when the AI generated a prescription that is
	// awaiting physician review — the actual medication details are withheld.
	HasPrescription      bool                 `json:"hasPrescription,omitempty"`
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
	// ProfileUpdated is true when EDIS collected and persisted one or more health
	// profile fields from the patient during this triage turn. The client should
	// refresh the user profile from the server when this is true.
	ProfileUpdated       bool                 `json:"profileUpdated,omitempty"`
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

	// Carry forward accumulated HPI only for continuation turns — NOT for the very
	// first message of a new chat. On a fresh session the HPI from a previous
	// unrelated case must not be injected or EDIS will skip symptom collection
	// and produce a stale diagnosis without gathering new symptoms.
	var knownHPI *ai.SymptomProfile
	if len(req.PreviousMessages) > 0 {
		knownHPI = s.fetchLatestHPI(req.UserID)
	}

	// Process never returns an error — graceful fallback is applied on failure.
	resp, _ := s.engine.Process(ctx, messages, req.Category, patient, knownHPI)

	return s.buildAndPublish(ctx, req.UserID, req.Message, req.Category, resp, start, req.ContinuationDiagnosisID)
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

	// Only carry forward HPI from the DB when the session already has prior turns.
	// A session with an empty history is a fresh intake — injecting old-case HPI
	// would bypass new symptom collection.
	var knownHPI *ai.SymptomProfile
	if len(history) > 0 {
		knownHPI = s.fetchLatestHPI(userID)
	}

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

	return s.buildAndPublish(ctx, userID, message, category, resp, start, "")
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
	diagnosisID, _ := s.saveDiagnosis(userID, "Session Summary: "+session.Title, resp.AIResponse, resp.Escalated, "")

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
func (s *Service) buildAndPublish(ctx context.Context, userID, message, category string, resp *edis.EDISResponse, start time.Time, continuationDiagnosisID string) (*ChatResponse, error) {
	enforceCategoryOutputPolicy(resp, category)

	// Persist any health profile fields collected from the patient this turn.
	// Done before building the response so ProfileUpdated reflects actual DB state.
	profileUpdated := s.saveProfileUpdate(ctx, userID, resp.ProfileUpdate)

	cr := &ChatResponse{
		Text:                 resp.Text,
		Diagnosis:            resp.Diagnosis,
		// Store prescription internally so saveDiagnosis can persist it, but
		// never serialise it to the patient — only expose the boolean flag.
		Prescription:         resp.Prescription,
		HasPrescription:      resp.Prescription != nil,
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
		ProfileUpdated:       profileUpdated,
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

	// Persist diagnosis only when triage is fully complete for clinical/escalated
	// turns: the full 5-field HPI must exist. When HPI is complete the AI should
	// also omit followUpQuestions (per the EDIS COMPLETION RULE), but we do not
	// block on that — if the model incidentally emits a stray follow-up question
	// alongside a fully-formed HPI we still persist, because the clinical data is
	// ready. Blocking on followUpQuestions here meant the diagnosis card only
	// appeared after the patient responded one extra time (bad UX).
	if resp.Escalated || strings.Contains(strings.ToUpper(resp.Mode), "CLINICAL") {
		if !hpiIsComplete(resp.HPI) {
			log.Printf("[EDIS] skipping case persistence — HPI incomplete (user=%s mode=%s)", userID, resp.Mode)
			return cr, nil
		}
	}

	// Persist diagnosis and publish ai.diagnosis.preliminary.
	id, isNewCase := s.saveDiagnosis(userID, message, resp.AIResponse, resp.Escalated, continuationDiagnosisID)
	if id == "" {
		return cr, nil
	}

	cr.DiagnosisID = id
	cr.IsExistingCase = !isNewCase

	// When the patient's current symptoms match an existing active case, prepend a
	// brief patient-facing notice so they know their record is being updated rather
	// than a new case being created, and that no credit was charged for this turn.
	if !isNewCase {
		cr.Text = "📋 Your symptoms match your existing open case — I've updated it with today's notes. No credit was charged for this update.\n\n" + cr.Text
	}

	diagData, _ := json.Marshal(map[string]interface{}{
		"user_id":      userID,
		"diagnosis_id": id,
		"diagnosis":    resp.Diagnosis,
		"conditions":   resp.Conditions,
		"escalated":    resp.Escalated,
		"is_new_case":  isNewCase,
	})
	_ = s.nats.Publish("ai.diagnosis.preliminary", diagData)

	// Real-time physician notification for new and updated Pending cases.
	// Broadcast a lightweight signal so connected physicians can refetch their queue.
	if s.notifier != nil {
		event := "physician.case.new"
		casePayload, _ := json.Marshal(map[string]interface{}{
			"caseId":    id,
			"urgency":   resp.Diagnosis.Urgency,
			"escalated": resp.Escalated,
			"isNew":     isNewCase,
		})
		s.notifier.Broadcast(event, casePayload)
	}

	// Push notification to all physicians with a registered Expo token so they
	// are alerted even when the app is in the background.
	if s.physPush != nil && resp.Escalated {
		go s.physPush.BroadcastToAllPhysicians(ctx,
			"New Escalated Case 🏥",
			"A patient case requires physician review.",
			map[string]string{"type": "physician.case.new", "caseId": id},
		)
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

func (s *Service) saveDiagnosis(userID, message string, resp *ai.AIResponse, escalated bool, continuationDiagnosisID string) (string, bool) {
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

	// Build a clean clinical description for the diagnosis card.
	// resp.Text is the conversational chat reply (may contain emojis, questions,
	// and interactive language) — it must never appear in the stored diagnosis
	// description. Use the structured clinical description from the AI's
	// diagnosis object instead, which the model populates as a plain clinical
	// summary with no first-person or interactive language.
	clinicalDesc := ""
	if resp.Diagnosis != nil && resp.Diagnosis.Description != "" {
		clinicalDesc = resp.Diagnosis.Description
	}

	// Explicit continuation path: when the client sends diagnosisId for an
	// active case, always update that same pending case instead of creating or
	// matching by condition text.
	if continuationDiagnosisID != "" {
		var existingID string
		err := s.db.QueryRow(`
			SELECT id::text
			FROM diagnoses
			WHERE id = $1::uuid
			  AND user_id = $2::uuid
			  AND status = 'Pending'
			LIMIT 1`, continuationDiagnosisID, userID,
		).Scan(&existingID)

		if err == nil && existingID != "" {
			hasPrescription := resp.Prescription != nil
			_, updateErr := s.db.Exec(`
				UPDATE diagnoses
				SET title                  = $2,
				    description            = $3,
				    condition              = $4,
				    urgency                = $5,
				    ai_response            = $6,
				    hpi                    = $7,
				    escalated              = $8,
				    has_prescription       = $9,
				    follow_up_date         = $10,
				    follow_up_instructions = $11,
				    updated_at             = NOW()
				WHERE id = $1::uuid`,
				existingID, title, clinicalDesc, condition, urgency, aiJSON, hpiJSON, escalated, hasPrescription,
				followUpDate, followUpInstructions,
			)
			if updateErr == nil {
				log.Printf("[EDIS] continuation case updated %s (user=%s)", existingID, userID)
				return existingID, false
			}
			log.Printf("[EDIS] continuation case update failed %s: %v", existingID, updateErr)
		}
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
		var existingID, existingStatus string
		lookupErr := s.db.QueryRow(`
			SELECT id::text, status
			FROM diagnoses
			WHERE user_id   = $1::uuid
			  AND status    IN ('Pending', 'Active')
			  AND created_at > NOW() - INTERVAL '90 days'
			  AND (
			        LOWER(COALESCE(condition,'')) = ANY($2)
			        OR LOWER(COALESCE(title,'')) = ANY($2)
			        OR EXISTS (
			            SELECT 1
			            FROM jsonb_array_elements(
			                     COALESCE(ai_response->'conditions', '[]'::jsonb)
			                 ) AS c
			            WHERE LOWER(c->>'condition') = ANY($2)
			        )
			  )
			ORDER BY (status = 'Pending') DESC, created_at DESC
			LIMIT 1`,
			userID, pq.Array(condNames),
		).Scan(&existingID, &existingStatus)

		if lookupErr == nil && existingID != "" {
			// For Active cases (already physician-reviewed) only signal the match —
			// never overwrite physician-reviewed data with the new AI output.
			if existingStatus == "Active" {
				log.Printf("[EDIS] active case match %s (conditions: %v user=%s) — skipping update", existingID, condNames, userID)
				return existingID, false
			}
			// For Pending cases: update with the latest AI output (new symptoms
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
				existingID, title, clinicalDesc, condition, urgency, aiJSON, hpiJSON, escalated, hasPrescription,
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
		userID, title, clinicalDesc, condition, urgency, aiJSON, hpiJSON, escalated, hasPrescription,
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

// ─── Available physicians ─────────────────────────────────────────────────────

// AvailablePhysician is the patient-facing view of a verified, active physician.
// Only public, non-sensitive fields are exposed.
type AvailablePhysician struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Specialization string `json:"specialization"`
	IsVerified     bool   `json:"isVerified"`
}

// GetAvailablePhysicians returns all MDCN-verified, active physicians suitable
// for display as preview cards in the patient-facing chat UI.
func (s *Service) GetAvailablePhysicians(ctx context.Context) ([]AvailablePhysician, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id::text, name, COALESCE(specialization, ''), mdcn_verified
		FROM users
		WHERE role = 'physician'
		  AND mdcn_verified = true
		  AND COALESCE(account_status, 'active') = 'active'
		  AND (flagged IS NULL OR flagged = false)
		ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AvailablePhysician
	for rows.Next() {
		var p AvailablePhysician
		if err := rows.Scan(&p.ID, &p.Name, &p.Specialization, &p.IsVerified); err != nil {
			continue
		}
		result = append(result, p)
	}
	if result == nil {
		result = []AvailablePhysician{}
	}
	return result, nil
}
