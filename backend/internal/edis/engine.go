// Package edis implements the Early Detection Intelligence System (EDIS) —
// LifeGate's probabilistic reasoning engine.
//
// EDIS wraps any ai.AIProvider with:
//   - A hard 30-second context timeout and graceful fallback (no raw error exposed)
//   - Probabilistic condition ranking with per-condition confidence scores
//   - Context-aware follow-up question generation
//   - Early-stage risk flag detection and severity classification
//   - Auto-escalation of General Mode to Clinical Mode on threshold breach
//   - Low-confidence detection with mandatory physician-review flag
package edis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
)

// ─── Thresholds ───────────────────────────────────────────────────────────────

const (
	// LowConfidenceThreshold is the minimum primary-diagnosis confidence below which
	// the response is flagged for mandatory physician review, even in General mode.
	LowConfidenceThreshold = 60

	// TimeoutDuration is the hard wall-clock limit for the entire Process call
	// including all retries. When exceeded, Process returns a graceful fallback.
	//
	// Set to 90 s so the total worst-case server time (attempt 1 ~60 s via the
	// ai httpClient + 1 s back-off + attempt 2 ~29 s governed by remaining
	// context) stays well under the axios 150 s client timeout, ensuring the
	// graceful fallback is always delivered before the client gives up.
	TimeoutDuration = 90 * time.Second

	// attemptTimeout caps each individual Process attempt. Each attempt derives
	// its context from the overall TimeoutDuration context, so the effective
	// deadline shrinks naturally on the second attempt.
	attemptTimeout = 90 * time.Second

	// maxRetries is the number of additional attempts after the first failure.
	// 1 retry gives a second chance on transient OpenAI errors while keeping
	// total worst-case server time (60 s + 1 s + ~29 s = 90 s) under 150 s.
	maxRetries = 1

	// retryBaseDelay is the initial back-off delay between retries.
	// Each subsequent retry doubles the delay (1 s → 2 s).
	retryBaseDelay = 1 * time.Second
)

// ─── Risk flag codes ─────────────────────────────────────────────────────────

const (
	FlagEarlyInfection   = "EARLY_INFECTION_RISK"
	FlagCardiac          = "CARDIAC_RISK"
	FlagNeurological     = "NEUROLOGICAL_RISK"
	FlagRespiratory      = "RESPIRATORY_RISK"
	FlagMetabolic        = "METABOLIC_RISK"
	FlagMentalHealth     = "MENTAL_HEALTH_CRISIS"
	FlagSepsis           = "SEPSIS_RISK"
	FlagHypertensive     = "HYPERTENSIVE_CRISIS"
	FlagPediatric        = "PEDIATRIC_CONCERN"
	FlagObstetric        = "OBSTETRIC_RISK"
	FlagGastrointestinal = "GASTROINTESTINAL_RISK"
	FlagRenal            = "RENAL_RISK"
)

var emergencyPreHPIFlags = map[string]struct{}{
	FlagCardiac:      {},
	FlagNeurological: {},
	FlagRespiratory:  {},
	FlagSepsis:       {},
	FlagHypertensive: {},
	FlagObstetric:    {},
	FlagMentalHealth: {},
}

func isEmergencyPreHPIFlag(flag ai.RiskFlag) bool {
	sev := strings.ToUpper(strings.TrimSpace(flag.Severity))
	if sev != "HIGH" && sev != "CRITICAL" {
		return false
	}
	code := strings.ToUpper(strings.TrimSpace(flag.Flag))
	_, ok := emergencyPreHPIFlags[code]
	return ok
}

var phoneNumberPattern = regexp.MustCompile(`\+?\d[\d\s().-]{6,}\d`)

func redactPhoneNumbers(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}
	return strings.TrimSpace(phoneNumberPattern.ReplaceAllString(text, "[redacted]"))
}

func sanitizeResponsePhoneNumbers(raw *ai.AIResponse) {
	if raw == nil {
		return
	}

	raw.Text = redactPhoneNumbers(raw.Text)

	for i := range raw.FollowUpQuestions {
		raw.FollowUpQuestions[i] = redactPhoneNumbers(raw.FollowUpQuestions[i])
	}

	if raw.Diagnosis != nil {
		raw.Diagnosis.Description = redactPhoneNumbers(raw.Diagnosis.Description)
	}

	for i := range raw.Conditions {
		raw.Conditions[i].Description = redactPhoneNumbers(raw.Conditions[i].Description)
	}

	for i := range raw.RiskFlags {
		raw.RiskFlags[i].Description = redactPhoneNumbers(raw.RiskFlags[i].Description)
	}

	for i := range raw.Investigations {
		raw.Investigations[i].Reason = redactPhoneNumbers(raw.Investigations[i].Reason)
	}
}

// ─── Response type ────────────────────────────────────────────────────────────

// EDISResponse embeds the full AI provider response and adds EDIS-derived metadata.
type EDISResponse struct {
	*ai.AIResponse

	// EscalationTrigger is non-empty when General → Clinical escalation occurred
	// and records the reason, e.g. "urgency_threshold_breach:HIGH".
	EscalationTrigger string `json:"escalationTrigger,omitempty"`

	// LowConfidence is true when the primary diagnosis confidence < LowConfidenceThreshold.
	LowConfidence bool `json:"lowConfidence,omitempty"`

	// NeedsPhysicianReview is true whenever the response must enter the physician queue
	// (low confidence, escalation, or HIGH/CRITICAL risk flag).
	NeedsPhysicianReview bool `json:"needsPhysicianReview,omitempty"`

	// Escalated is true when General Mode has been automatically escalated to Clinical Mode.
	Escalated bool `json:"escalated,omitempty"`

	// ProfileUpdate carries health profile fields collected from the patient during
	// this triage turn. Non-nil when the AI collected at least one missing field.
	// The genai service persists these to the users table.
	ProfileUpdate *ai.ProfileUpdate `json:"profileUpdate,omitempty"`
}

// ─── PatientContext ──────────────────────────────────────────────────────────

// PatientContext holds the patient's clinical profile retrieved from the
// LifeGate EMR. All fields are optional — zero/empty values are omitted from
// the system prompt so they do not mislead the AI.
type PatientContext struct {
	Name               string
	Age                int    // 0 = unknown
	Gender             string
	Language           string // patient's preferred language, if known
	BloodType          string
	Genotype           string
	Allergies          string
	MedicalHistory     string
	CurrentMedications string
	State              string // patient's state/province, if known
	Country            string // patient's country, if known
	// MissingProfileFields lists health profile fields that are not yet on record
	// for this patient. When non-empty, EDIS is instructed to collect them
	// naturally during triage and return them in a ProfileUpdate response field.
	MissingProfileFields []string
}

// ─── Engine ───────────────────────────────────────────────────────────────────

// Engine is the EDIS runtime that wraps an ai.AIProvider.
type Engine struct {
	provider ai.AIProvider
}

// NewEngine returns an EDIS Engine backed by the given AI provider.
func NewEngine(provider ai.AIProvider) *Engine {
	return &Engine{provider: provider}
}

// ProviderName returns the name of the underlying AI provider.
func (e *Engine) ProviderName() string {
	return e.provider.Name()
}

// Ping sends a minimal message to the AI provider and returns any error.
// Unlike Process, Ping does NOT apply a graceful fallback — errors are propagated
// directly so callers (e.g. the health-check handler) can detect provider unavailability.
func (e *Engine) Ping(ctx context.Context) error {
	resp, err := e.provider.Chat(ctx, "You are a health-check assistant. Reply with {\"text\":\"pong\"}.",
		[]ai.ChatMessage{{Role: "USER", Text: "ping"}})
	if err != nil {
		return err
	}
	if resp == nil || resp.Text == "" {
		return fmt.Errorf("AI provider returned empty response")
	}
	return nil
}

// Process runs the full EDIS pipeline for a conversation history.
//
//  1. Applies a hard 120-second context timeout (covers all retries).
//  2. Builds the EDIS system prompt for the given category, injecting the
//     patient's clinical record so the AI can avoid allergenic prescriptions,
//     detect drug interactions, and contextualise differentials.
//  3. If a knownHPI is supplied (collected from a previous turn), injects it
//     into the system prompt so the AI never re-asks for already-known fields.
//  4. Calls the AI provider with up to maxRetries retries on transient errors,
//     using exponential back-off. Retries are skipped when the context is
//     already cancelled (e.g. the hard timeout was hit).
//  5. On persistent failure or timeout, returns a graceful fallback — never
//     propagates the error to the caller.
//  6. Analyses the raw response to compute escalation, low-confidence, and
//     physician-review flags.
func (e *Engine) Process(ctx context.Context, messages []ai.ChatMessage, category string, patient PatientContext, knownHPI ...*ai.SymptomProfile) (*EDISResponse, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, TimeoutDuration)
	defer cancel()

	var hpi *ai.SymptomProfile
	if len(knownHPI) > 0 {
		hpi = knownHPI[0]
	}
	prompt := buildEDISPrompt(category, patient, hpi)

	var (
		raw     *ai.AIResponse
		lastErr error
	)

	for attempt := 0; attempt <= maxRetries; attempt++ {
		// If the overall deadline has already passed, stop retrying.
		if timeoutCtx.Err() != nil {
			log.Printf("[EDIS] context cancelled before attempt %d (category=%s): %v", attempt+1, category, timeoutCtx.Err())
			break
		}

		// Back-off before each retry (not before the first attempt).
		if attempt > 0 {
			delay := retryBaseDelay * time.Duration(1<<uint(attempt-1)) // 1s, 2s, …
			log.Printf("[EDIS] retry %d/%d after %v (category=%s provider=%s): %v",
				attempt, maxRetries, delay, category, e.provider.Name(), lastErr)
			select {
			case <-time.After(delay):
			case <-timeoutCtx.Done():
				log.Printf("[EDIS] context cancelled during back-off (category=%s): %v", category, timeoutCtx.Err())
				break
			}
			if timeoutCtx.Err() != nil {
				break
			}
		}

		// Each attempt gets its own child context so a slow response on
		// attempt N does not shrink the deadline available for attempt N+1.
		attemptCtx, attemptCancel := context.WithTimeout(timeoutCtx, attemptTimeout)
		raw, lastErr = e.provider.Chat(attemptCtx, prompt, messages)
		attemptCancel()
		if lastErr == nil {
			// Success — stop retrying.
			break
		}
	}

	if lastErr != nil {
		log.Printf("[EDIS] all attempts failed (category=%s provider=%s attempts=%d): %v",
			category, e.provider.Name(), maxRetries+1, lastErr)
		return gracefulFallback(), nil
	}

	raw = e.enforcePreferredLanguage(timeoutCtx, raw, patient.Language)

	return analyze(raw, category), nil
}

func isEnglishLanguage(language string) bool {
	normalized := strings.ToLower(strings.TrimSpace(language))
	return normalized == "" ||
		normalized == "english" ||
		normalized == "en" ||
		normalized == "en-us" ||
		normalized == "en-gb"
}

func (e *Engine) enforcePreferredLanguage(ctx context.Context, raw *ai.AIResponse, language string) *ai.AIResponse {
	if raw == nil || isEnglishLanguage(language) {
		return raw
	}

	payload, err := json.Marshal(raw)
	if err != nil {
		log.Printf("[EDIS] language enforcement marshal failed: %v", err)
		return raw
	}

	userMessage := "TARGET_LANGUAGE: " + strings.TrimSpace(language) + "\n" +
		"REWRITE the JSON below so all patient-facing text is in TARGET_LANGUAGE, preserving clinical meaning and ALL non-language fields/values:\n" +
		string(payload)

	rewritten, err := e.provider.Chat(ctx, languageRewriteSystemPrompt, []ai.ChatMessage{{
		Role: "USER",
		Text: userMessage,
	}})
	if err != nil || rewritten == nil {
		if err != nil {
			log.Printf("[EDIS] language enforcement rewrite failed: %v", err)
		}
		return raw
	}

	if strings.TrimSpace(rewritten.Text) != "" {
		raw.Text = rewritten.Text
	}

	if len(rewritten.FollowUpQuestions) > 0 {
		raw.FollowUpQuestions = rewritten.FollowUpQuestions
	}

	if raw.Diagnosis != nil && rewritten.Diagnosis != nil {
		if strings.TrimSpace(rewritten.Diagnosis.Description) != "" {
			raw.Diagnosis.Description = rewritten.Diagnosis.Description
		}
	}

	for i := 0; i < len(raw.Conditions) && i < len(rewritten.Conditions); i++ {
		if strings.TrimSpace(rewritten.Conditions[i].Description) != "" {
			raw.Conditions[i].Description = rewritten.Conditions[i].Description
		}
	}

	for i := 0; i < len(raw.RiskFlags) && i < len(rewritten.RiskFlags); i++ {
		if strings.TrimSpace(rewritten.RiskFlags[i].Description) != "" {
			raw.RiskFlags[i].Description = rewritten.RiskFlags[i].Description
		}
	}

	for i := 0; i < len(raw.Investigations) && i < len(rewritten.Investigations); i++ {
		if strings.TrimSpace(rewritten.Investigations[i].Reason) != "" {
			raw.Investigations[i].Reason = rewritten.Investigations[i].Reason
		}
	}

	if raw.Prescription != nil && rewritten.Prescription != nil {
		if strings.TrimSpace(rewritten.Prescription.Instructions) != "" {
			raw.Prescription.Instructions = rewritten.Prescription.Instructions
		}
	}

	return raw
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// analyze derives escalation metadata from a raw AIResponse and returns an EDISResponse.
// category is used to enforce mode-specific safety rules (e.g. prescription restriction).
func analyze(raw *ai.AIResponse, category string) *EDISResponse {
	resp := &EDISResponse{AIResponse: raw}
	sanitizeResponsePhoneNumbers(raw)

	// Ensure mode is set.
	if raw.Mode == "" {
		raw.Mode = "general"
	}

	// ── Prescription mode gate ───────────────────────────────────────────────	// Prescriptions are only permitted in clinical_diagnosis mode.
	// Any prescription the model produces for a non-clinical category is
	// stripped here as a hard safety rule, regardless of what the AI returned.
	if category != "clinical_diagnosis" && raw.Prescription != nil {
		log.Printf("[EDIS] prescription stripped for non-clinical category: category=%q condition=%q", category, func() string {
			if raw.Diagnosis != nil {
				return raw.Diagnosis.Condition
			}
			return "(no diagnosis)"
		}())
		raw.Prescription = nil
	}

	// ── Sensor category bypass ────────────────────────────────────────────────
	// Device-measured results (vision battery, audiometry) carry no patient HPI
	// by design — the data are objective measurements, not symptom reports.
	// The HPI gate must not strip their diagnosis; follow-up intake questions
	// are also irrelevant for these categories.
	isSensorCategory := category == "eye_checkup" || category == "hearing_test"

	// ── Mode gate — server-side enforcement of the MODE GATE HARD RULE ────────
	// The system prompt forbids clinical fields (diagnosis, conditions, riskFlags,
	// prescription, followUpPlan) when mode="general". A hallucinating model may
	// violate this rule, so we strip those fields here as a hard safety net.
	// Sensor categories bypass this gate — device measurements always yield a
	// diagnosis regardless of mode.
	if !isSensorCategory && raw.Mode == "general" {
		if raw.Diagnosis != nil {
			log.Printf("[EDIS] mode gate: diagnosis stripped for mode=general condition=%q", raw.Diagnosis.Condition)
			raw.Diagnosis = nil
		}
		if len(raw.Conditions) > 0 {
			log.Printf("[EDIS] mode gate: %d conditions stripped for mode=general", len(raw.Conditions))
			raw.Conditions = nil
		}
		if len(raw.RiskFlags) > 0 {
			log.Printf("[EDIS] mode gate: %d risk flags stripped for mode=general", len(raw.RiskFlags))
			raw.RiskFlags = nil
		}
		raw.Prescription = nil
		raw.FollowUpPlan = nil
	}

	// ── HPI gate — enforce triage-before-diagnosis server-side ────────────────
	// Requires ALL five OLDCARTS fields before a diagnosis is released.
	// The prompt allows onset+duration+severityScore to unlock diagnosis, but
	// the server enforces the stricter 5-field bar so the AI must collect
	// location and character too before committing to a diagnosis.
	// followUpPlan and prescription are also stripped — they are meaningless
	// without a confirmed diagnosis.
	// Once HPI is fully complete, followUpQuestions are cleared so triage
	// chips don't appear alongside the diagnosis card in the UI.
	// NOTE: sensor categories bypass this gate entirely — see above.
	hpiComplete := raw.HPI != nil &&
		raw.HPI.Onset != "" &&
		raw.HPI.Duration != "" &&
		raw.HPI.SeverityScore > 0 &&
		raw.HPI.Location != "" &&
		raw.HPI.Character != ""
	if !isSensorCategory {
		if !hpiComplete && raw.Diagnosis != nil {
			log.Printf("[EDIS] premature diagnosis stripped (hpi incomplete): condition=%q", raw.Diagnosis.Condition)
			raw.Diagnosis = nil
			raw.Prescription = nil
			raw.FollowUpPlan = nil
		}
		if hpiComplete {
			// Triage is done — suppress follow-up questions so chips don't render
			// alongside the diagnosis card in the client.
			raw.FollowUpQuestions = nil
		}
	} else {
		// Sensor categories never require HPI intake — always clear follow-up
		// questions so the UI doesn't show symptom intake chips for test results.
		raw.FollowUpQuestions = nil
	}

	// ── Diagnosis synthesis fallback ───────────────────────────────────────────
	// Synthesise a diagnosis from the top condition when:
	//   a) The AI deliberately omitted 'diagnosis' despite high-confidence conditions
	//   b) For conversational categories: HPI intake is sufficiently complete
	//   c) For sensor categories: always eligible (device data is the HPI substitute)
	synthesisEligible := isSensorCategory || hpiComplete
	if raw.Diagnosis == nil && len(raw.Conditions) > 0 && raw.Conditions[0].Confidence >= 50 && synthesisEligible {
		top := raw.Conditions[0]
		raw.Diagnosis = &ai.Diagnosis{
			Condition:   top.Condition,
			Urgency:     synthesisUrgency(top.Confidence, raw.Investigations),
			Description: top.Description,
			Confidence:  top.Confidence,
		}
	}

	// ── Prescription-based mandatory review ───────────────────────────────────
	// Any response that includes a prescription must enter the physician review
	// queue regardless of urgency or confidence level. Prescriptions must be
	// validated by a licensed physician before they are released to the patient.
	if raw.Prescription != nil {
		resp.NeedsPhysicianReview = true
	}

	// ── Low-confidence detection ───────────────────────────────────────────────
	// A diagnosis with confidence present but below threshold → mandatory review.
	if raw.Diagnosis != nil && raw.Diagnosis.Confidence > 0 && raw.Diagnosis.Confidence < LowConfidenceThreshold {
		resp.LowConfidence = true
		resp.NeedsPhysicianReview = true
	}

	// Practical policy:
	//   1) Emergency override: conversational sessions may escalate before full HPI,
	//      but only for hard red-flag risk codes at HIGH/CRITICAL severity.
	//   2) Standard escalation path (urgency/risk): requires full HPI for
	//      conversational sessions.
	//   3) Diagnosis release remains tied to full HPI by the HPI gate above.
	if !isSensorCategory && !hpiComplete {
		for _, flag := range raw.RiskFlags {
			if !isEmergencyPreHPIFlag(flag) {
				continue
			}
			resp.Escalated = true
			resp.NeedsPhysicianReview = true
			if resp.EscalationTrigger == "" {
				resp.EscalationTrigger = fmt.Sprintf("emergency_risk_flag:%s", strings.ToUpper(strings.TrimSpace(flag.Flag)))
			}
			break
		}
	}

	// Non-sensor conversational flows use full-HPI gating for standard escalation.
	// Sensor categories remain eligible immediately because they are objective tests.
	escalationEligible := isSensorCategory || hpiComplete

	// ── Urgency-based escalation ───────────────────────────────────────────────
	// Any diagnosis urgency (LOW, MEDIUM, HIGH, CRITICAL) triggers
	// General → Clinical escalation once escalation is eligible.
	if escalationEligible && raw.Diagnosis != nil {
		urg := strings.ToUpper(raw.Diagnosis.Urgency)
		if urg == "LOW" || urg == "MEDIUM" || urg == "HIGH" || urg == "CRITICAL" {
			resp.Escalated = true
			resp.EscalationTrigger = fmt.Sprintf("urgency_threshold_breach:%s", urg)
			resp.NeedsPhysicianReview = true
		}
	}

	// ── Risk-flag-based escalation ─────────────────────────────────────────────
	// Any HIGH or CRITICAL severity risk flag triggers escalation and physician review.
	if escalationEligible {
		for _, flag := range raw.RiskFlags {
			sev := strings.ToUpper(flag.Severity)
			if sev == "HIGH" || sev == "CRITICAL" {
				resp.Escalated = true
				resp.NeedsPhysicianReview = true
				if resp.EscalationTrigger == "" {
					resp.EscalationTrigger = fmt.Sprintf("risk_flag:%s", flag.Flag)
				}
			}
		}
	}

	// ── Mode update ────────────────────────────────────────────────────────────
	// Any escalation signal promotes the response to Clinical mode.
	if resp.Escalated || resp.LowConfidence {
		raw.Mode = "clinical"
	}
	// ── Profile update pass-through ─────────────────────────────────
	// Propagate any health profile fields collected from the patient this turn.
	resp.ProfileUpdate = raw.ProfileUpdate
	return resp
}

// gracefulFallback returns a user-safe response when the AI provider fails or times out.
func gracefulFallback() *EDISResponse {
	return &EDISResponse{
		AIResponse: &ai.AIResponse{
			Text: "I'm having a little trouble right now — it might be a brief connection issue. " +
				"Please try sending your message again in a moment. " +
				"If you're experiencing a medical emergency, please seek immediate emergency care.",
			Mode: "general",
		},
	}
}

const languageRewriteSystemPrompt = `You are a clinical response localizer for LifeGate.

You will receive:
- TARGET_LANGUAGE
- A JSON object that follows LifeGate's AI response schema.

Task:
1. Rewrite ALL patient-facing natural-language strings into TARGET_LANGUAGE.
2. Keep clinical meaning, urgency, and safety intent exactly the same.
3. Preserve ALL structure and non-language values exactly (numbers, enums, booleans, nulls, field presence).
4. Do NOT add/remove fields.
5. Return ONLY valid JSON.`

// summarizationSystemPrompt instructs the AI to produce a compact clinical
// summary from a conversation segment. The schema is intentionally a subset of
// the full AIResponse so that the result can be parsed by the existing provider
// JSON decoder (Text → "text", Conditions → "conditions", RiskFlags → "riskFlags").
const summarizationSystemPrompt = `You are a clinical records condensation assistant for EDIS (Early Detection Intelligence System).
You will be given a segment of a patient-AI conversation. Your task is to produce a concise, structured clinical summary.

Respond ONLY with valid JSON matching EXACTLY this schema:
{
  "text": "2–3 sentence clinical narrative covering the patient's reported symptoms, key findings, and current working assessment.",
  "conditions": [
    {"condition": "condition name", "confidence": 70, "description": "brief clinical reasoning"}
  ],
  "riskFlags": [
    {"flag": "RISK_CODE", "severity": "LOW|MEDIUM|HIGH|CRITICAL", "description": "brief risk description"}
  ]
}

Rules:
- "text" is ALWAYS required. Keep it factual, clinical, and under 80 words.
- Include "conditions" only if conditions/diagnoses were discussed. Omit the key entirely otherwise.
- Include "riskFlags" only if risk signals were detected. Omit the key entirely otherwise.
- Do NOT fabricate data. Summarise only what is present in the provided conversation.
- Do NOT include any key not listed in the schema above.`

// Summarize calls the underlying AI provider with a focused summarisation
// prompt for the given message slice and returns a structured ClinicalSummary.
// It uses a hard 30-second timeout independent of the main Process timeout.
// On error the caller should degrade gracefully (e.g. fall back to truncation).
func (e *Engine) Summarize(ctx context.Context, messages []ai.ChatMessage) (*ai.ClinicalSummary, error) {
	sumCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	raw, err := e.provider.Chat(sumCtx, summarizationSystemPrompt, messages)
	if err != nil {
		return nil, fmt.Errorf("clinical summarisation: %w", err)
	}
	if raw == nil || raw.Text == "" {
		return nil, fmt.Errorf("clinical summarisation: empty response from provider")
	}

	return &ai.ClinicalSummary{
		SummaryText:      raw.Text,
		ActiveConditions: raw.Conditions,
		Flags:            raw.RiskFlags,
	}, nil
}

// buildEDISPrompt constructs the full system prompt by combining:
//  1. The base EDIS/health system prompt
//  2. The patient's clinical record (if available)
//  3. The known HPI state from previous turns (if available) — fixes Issue 5:
//     without this, the AI must infer already-collected OLDCARTS fields from
//     conversational prose and often re-asks or forgets them.
//  4. The profile collection block when the patient's health profile is incomplete
//  5. The category-specific snippet
func buildEDISPrompt(category string, patient PatientContext, knownHPI *ai.SymptomProfile) string {
	base := ai.HealthSystemPrompt
	patientBlock := buildPatientContextBlock(patient)
	if patientBlock != "" {
		base = base + "\n\n" + patientBlock
	}
	if knownHPI != nil {
		base = base + "\n\n" + buildHPIStateBlock(knownHPI)
	}
	if len(patient.MissingProfileFields) > 0 {
		base = base + "\n\n" + buildProfileCollectionBlock(patient.MissingProfileFields)
	}
	if snippet, ok := ai.CategoryPromptSnippets[category]; ok {
		return base + "\n\n" + snippet
	}
	return base
}

// buildHPIStateBlock formats the already-collected HPI fields into a structured
// block injected into the system prompt. Only populated fields are shown so the
// AI is not misled by empty values.
func buildHPIStateBlock(h *ai.SymptomProfile) string {
	var b strings.Builder
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString("CURRENT SESSION HPI STATE (already collected — DO NOT re-ask for these)\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	if h.Onset != "" {
		fmt.Fprintf(&b, "Onset         : %s\n", h.Onset)
	}
	if h.Duration != "" {
		fmt.Fprintf(&b, "Duration      : %s\n", h.Duration)
	}
	if h.SeverityScore > 0 {
		fmt.Fprintf(&b, "Severity      : %d/10\n", h.SeverityScore)
	}
	if h.Location != "" {
		fmt.Fprintf(&b, "Location      : %s\n", h.Location)
	}
	if h.Character != "" {
		fmt.Fprintf(&b, "Character     : %s\n", h.Character)
	}
	missing := []string{}
	if h.Onset == "" {
		missing = append(missing, "onset")
	}
	if h.Duration == "" {
		missing = append(missing, "duration")
	}
	if h.SeverityScore == 0 {
		missing = append(missing, "severityScore")
	}
	if h.Location == "" {
		missing = append(missing, "location")
	}
	if h.Character == "" {
		missing = append(missing, "character")
	}
	if len(missing) > 0 {
		fmt.Fprintf(&b, "Still needed  : %s\n", strings.Join(missing, ", "))
	} else {
		b.WriteString("Status        : HPI COMPLETE — include 'hpi' object and 'diagnosis' in response\n")
	}
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	return b.String()
}

// buildPatientContextBlock formats the patient's clinical profile into a
// structured block that is injected into the system prompt. Fields that are
// empty or unknown are omitted so the AI does not fabricate data.
func buildPatientContextBlock(p PatientContext) string {
	if p.Name == "" && p.Age == 0 && p.Gender == "" && p.BloodType == "" && p.Genotype == "" &&
		p.Allergies == "" && p.MedicalHistory == "" && p.CurrentMedications == "" &&
		p.State == "" && p.Country == "" && p.Language == "" {
		return ""
	}

	var b strings.Builder
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString("PATIENT CLINICAL RECORD (LifeGate EMR — verified)\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

	if p.Name != "" {
		fmt.Fprintf(&b, "Name          : %s\n", p.Name)
	}
	if p.Age > 0 {
		fmt.Fprintf(&b, "Age           : %d years old\n", p.Age)
	}
	if p.Gender != "" {
		fmt.Fprintf(&b, "Sex           : %s\n", p.Gender)
	}
	if p.Language != "" {
		fmt.Fprintf(&b, "Language      : %s\n", p.Language)
	}
	if p.State != "" || p.Country != "" {
		location := p.State
		if p.Country != "" {
			if location != "" {
				location += ", " + p.Country
			} else {
				location = p.Country
			}
		}
		fmt.Fprintf(&b, "Location      : %s\n", location)
	}
	if p.BloodType != "" {
		fmt.Fprintf(&b, "Blood Type    : %s\n", p.BloodType)
	}
	if p.Genotype != "" {
		fmt.Fprintf(&b, "Genotype      : %s\n", p.Genotype)
	}
	if p.Allergies != "" {
		fmt.Fprintf(&b, "Allergies     : %s\n", p.Allergies)
	}
	if p.MedicalHistory != "" {
		fmt.Fprintf(&b, "Medical Hx    : %s\n", p.MedicalHistory)
	}
	if p.CurrentMedications != "" {
		fmt.Fprintf(&b, "Current Meds  : %s\n", p.CurrentMedications)
	}

	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString("SAFETY RULES — YOU MUST FOLLOW THESE:\n")
	b.WriteString("• NEVER prescribe or suggest any medication the patient is documented as allergic to.\n")
	b.WriteString("• CHECK for drug interactions between your suggestions and the patient's current medications.\n")
	b.WriteString("• USE the patient's existing conditions to sharpen your differential diagnoses.\n")
	b.WriteString("• RAISE urgency appropriately when comorbidities increase vulnerability (e.g. diabetes, immunosuppression).\n")
	if p.Language != "" {
		b.WriteString("• RESPOND in the patient's preferred language shown above.\n")
	}
	if p.State != "" || p.Country != "" {
		b.WriteString("• CONSIDER endemic diseases, regional pathogens, and locally prevalent conditions for the patient's location.\n")
	}
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	return b.String()
}

// buildProfileCollectionBlock formats the list of missing health profile fields
// into a structured block injected into the system prompt. EDIS uses this to
// collect the fields naturally during triage and return them in 'profileUpdate'.
func buildProfileCollectionBlock(missingFields []string) string {
	if len(missingFields) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	b.WriteString("PATIENT PROFILE — MISSING FIELDS (collect naturally during this triage)\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	for _, f := range missingFields {
		fmt.Fprintf(&b, "  • %s\n", f)
	}
	b.WriteString("When the patient answers any of these, include the values in 'profileUpdate'.\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	return b.String()
}

// synthesisUrgency maps a top-condition confidence score (and presence of investigations)
func synthesisUrgency(confidence int, investigations []ai.Investigation) string {
	// If any URGENT or STAT test is recommended the case warrants at least MEDIUM urgency.
	for _, inv := range investigations {
		urg := strings.ToUpper(inv.Urgency)
		if urg == "STAT" {
			return "HIGH"
		}
		if urg == "URGENT" {
			return "MEDIUM"
		}
	}
	if confidence >= 75 {
		return "MEDIUM"
	}
	return "LOW"
}
