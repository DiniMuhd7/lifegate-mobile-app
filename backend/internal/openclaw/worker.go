// Package openclaw implements the background worker that drives the 24
// OpenClaw AI physician agents.  Each physician is backed by a markdown agent
// definition stored in lifegate-openclaw/agents/<slug>/ and interacts with
// patients through the LifeGate IM system using the configured AI provider.
//
// Worker lifecycle (runs every pollInterval):
//  1. Find Active cases where the last IM is from the patient → generate and
//     post an AI physician reply.
//  2. Find Active cases where EDIS has set a diagnosis AND the last IM is from
//     the physician (AI already replied) → complete the case and notify all
//     parties via WebSocket.
package openclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
)

const (
	pollInterval    = 20 * time.Second
	completionDelay = 30 * time.Second // separate tick for completion checks
	replyBatchLimit = 10
	completeBatchLimit = 10
)

// Broadcaster is satisfied by the WebSocket hub — identical to the interface
// in physician/service.go, duplicated here to avoid an import cycle.
type Broadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
	Broadcast(event string, data []byte)
	BroadcastToRole(role, event string, data []byte)
}

// PushNotifier delivers push notifications — identical signature to physician.
type PushNotifier interface {
	SendToUser(ctx context.Context, userID, title, body string, data map[string]string)
}

// Worker is the OpenClaw AI physician response engine.
type Worker struct {
	repo       *Repository
	ai         ai.AIProvider
	hub        Broadcaster
	push       PushNotifier // optional
	agentsDir  string

	// In-memory persona cache: slug → combined system prompt string.
	personaMu    sync.RWMutex
	personaCache map[string]string

	// In-memory physician name cache: slug → display name.
	nameMu    sync.RWMutex
	nameCache map[string]string
}

// New constructs a Worker.  agentsDir is the filesystem path to the
// lifegate-openclaw/agents/ directory (e.g. "../lifegate-openclaw/agents").
func New(repo *Repository, provider ai.AIProvider, hub Broadcaster, agentsDir string) *Worker {
	return &Worker{
		repo:         repo,
		ai:           provider,
		hub:          hub,
		agentsDir:    agentsDir,
		personaCache: make(map[string]string),
		nameCache:    make(map[string]string),
	}
}

// SetPushNotifier wires in optional push notifications.
func (w *Worker) SetPushNotifier(p PushNotifier) { w.push = p }

// Start runs the polling loop until ctx is cancelled.
func (w *Worker) Start(ctx context.Context) {
	replyTicker := time.NewTicker(pollInterval)
	completeTicker := time.NewTicker(completionDelay)
	defer replyTicker.Stop()
	defer completeTicker.Stop()

	log.Printf("[openclaw-worker] started (agents=%s, reply_interval=%v, complete_interval=%v)",
		w.agentsDir, pollInterval, completionDelay)

	// Run an initial cycle immediately on startup.
	w.runReplyCycle(ctx)
	w.runCompletionCycle(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[openclaw-worker] stopped")
			return
		case <-replyTicker.C:
			w.runReplyCycle(ctx)
		case <-completeTicker.C:
			w.runCompletionCycle(ctx)
		}
	}
}

// ── Reply cycle ──────────────────────────────────────────────────────────────

func (w *Worker) runReplyCycle(ctx context.Context) {
	cases, err := w.repo.ListCasesNeedingReply(ctx, replyBatchLimit)
	if err != nil {
		log.Printf("[openclaw-worker] list cases needing reply: %v", err)
		return
	}

	for _, c := range cases {
		if err := w.handleReply(ctx, c); err != nil {
			log.Printf("[openclaw-worker] reply for case %s (agent=%s): %v",
				c.CaseID, c.AgentSlug, err)
		}
	}
}

func (w *Worker) handleReply(ctx context.Context, c caseNeedingReply) error {
	// 1. Build the physician system prompt from agent definition files.
	systemPrompt, err := w.buildSystemPrompt(c)
	if err != nil {
		return fmt.Errorf("build system prompt: %w", err)
	}

	// 2. Fetch conversation history and convert to ChatMessage slice.
	history, err := w.repo.GetConversationHistory(ctx, c.CaseID)
	if err != nil {
		return fmt.Errorf("get conversation history: %w", err)
	}
	messages := buildChatMessages(history)
	if len(messages) == 0 {
		return nil // no messages yet — nothing to reply to
	}

	// 3. Call the AI provider.
	resp, err := w.ai.Chat(ctx, systemPrompt, messages)
	if err != nil {
		return fmt.Errorf("ai.Chat: %w", err)
	}

	replyText := strings.TrimSpace(resp.Text)
	if replyText == "" {
		return nil
	}

	// 4. Persist the reply as a physician IM message.
	physicianName := w.cachedPhysicianName(c.AgentSlug)
	msgID, err := w.repo.InsertPhysicianMessage(ctx, c.CaseID, c.PhysicianID, physicianName, replyText)
	if err != nil {
		return fmt.Errorf("insert physician message: %w", err)
	}

	// 5. Broadcast the new message to the patient via WebSocket.
	w.broadcastNewMessage(msgID, c.CaseID, c.PatientID, c.PhysicianID, physicianName, replyText)

	// 6. Push notification so the patient is alerted even when the app is in
	//    the background or closed.
	if w.push != nil && c.PatientID != "" {
		pushData := map[string]string{
			"type":        "im_message",
			"diagnosisId": c.CaseID,
		}
		w.push.SendToUser(ctx, c.PatientID,
			"New message from your doctor",
			physicianName+" sent you a message",
			pushData,
		)
	}

	log.Printf("[openclaw-worker] replied to case %s (agent=%s, patient=%s)",
		c.CaseID, c.AgentSlug, c.PatientID)
	return nil
}

// ── Review cycle ─────────────────────────────────────────────────────────────

func (w *Worker) runCompletionCycle(ctx context.Context) {
	cases, err := w.repo.ListCasesReadyForReview(ctx, completeBatchLimit)
	if err != nil {
		log.Printf("[openclaw-worker] list cases ready for review: %v", err)
		return
	}

	for _, c := range cases {
		if err := w.handleReview(ctx, c); err != nil {
			log.Printf("[openclaw-worker] review case %s (agent=%s): %v",
				c.CaseID, c.AgentSlug, err)
		}
	}
}

// handleReview performs a full structured clinical review for a completed
// AI-reply case.  It mirrors the physician case review screen flow exactly:
//  1. Build a review system prompt with EDIS diagnostic output + patient profile.
//  2. Ask the AI physician to return a structured JSON review decision.
//  3. Parse the decision (Approved / Rejected) along with optional overrides
//     for prescription, conditions, and investigations.
//  4. Call ReviewCase (identical SQL to physician.Repository.ReviewReport) to
//     persist the decision, physician_notes, and any physician_ai_output.
//  5. Broadcast diagnosis.update to the patient and physician.review.status to
//     all physicians, then send a push notification to the patient.
func (w *Worker) handleReview(ctx context.Context, c caseForReview) error {
	// 1. Build the structured review system prompt.
	systemPrompt, err := w.buildReviewSystemPrompt(c)
	if err != nil {
		return fmt.Errorf("build review prompt: %w", err)
	}

	// 2. Call AI with a single instruction to produce the review JSON.
	messages := []ai.ChatMessage{
		{Role: "user", Text: "Please review this case now and provide your structured clinical assessment as the JSON object."},
	}
	resp, err := w.ai.Chat(ctx, systemPrompt, messages)
	if err != nil {
		return fmt.Errorf("ai.Chat (review): %w", err)
	}

	// 3. Validate and normalise the decision.
	decision := strings.TrimSpace(resp.PhysicianDecision)
	if decision != "Approved" && decision != "Rejected" {
		// AI returned an invalid or missing decision — default to Approved so
		// the case is not left hanging, and log the anomaly.
		log.Printf("[openclaw-worker] case %s: unexpected physician_decision %q — defaulting to Approved",
			c.CaseID, decision)
		decision = "Approved"
	}

	// 4. Build the repository input from the AI response.
	input := reviewInput{
		Notes:             strings.TrimSpace(resp.Text),
		PhysicianDecision: decision,
		RejectionReason:   strings.TrimSpace(resp.RejectionReason),
	}
	// Only set overrides when the AI explicitly provided non-nil / non-empty values.
	if resp.Prescription != nil {
		input.UpdatedPrescription = resp.Prescription
	}
	if len(resp.Conditions) > 0 {
		input.UpdatedConditions = resp.Conditions
	}
	if len(resp.Investigations) > 0 {
		input.UpdatedInvestigations = resp.Investigations
	}

	// 5. Persist the decision via ReviewCase (mirrors ReviewReport SQL exactly).
	patientID, err := w.repo.ReviewCase(ctx, c.CaseID, c.PhysicianID, input)
	if err != nil {
		return fmt.Errorf("ReviewCase: %w", err)
	}
	if patientID == "" {
		return nil // already completed — idempotent
	}

	// 6. Broadcast WebSocket events.
	if w.hub != nil {
		diagPayload, _ := json.Marshal(map[string]string{
			"diagnosisId": c.CaseID,
			"status":      "Completed",
			"decision":    decision,
		})
		w.hub.BroadcastToUser(patientID, "diagnosis.update", diagPayload)

		queuePayload, _ := json.Marshal(map[string]string{
			"caseId":   c.CaseID,
			"status":   "Completed",
			"decision": decision,
		})
		w.hub.BroadcastToRole("professional", "physician.review.status", queuePayload)
	}

	// 7. Push notification to patient.
	if w.push != nil {
		var title, body string
		if decision == "Approved" {
			title = "Case Reviewed"
			body = "Your case has been reviewed and approved by your physician. Open the app to see your full diagnosis and treatment plan."
		} else {
			title = "Case Review Update"
			body = "Your physician has completed your case review. Open the app to see the updated assessment."
		}
		w.push.SendToUser(ctx, patientID, title, body,
			map[string]string{"type": "case_reviewed", "diagnosisId": c.CaseID},
		)
	}

	log.Printf("[openclaw-worker] reviewed case %s (agent=%s, patient=%s, decision=%s)",
		c.CaseID, c.AgentSlug, patientID, decision)
	return nil
}

// ── System prompt builders ────────────────────────────────────────────────────

// buildReviewSystemPrompt constructs the structured clinical review prompt for
// the AI physician.  It embeds the full EDIS diagnostic output and patient
// profile so the AI can make a clinically informed approve/reject decision
// with optional prescription, condition, and investigation overrides.
//
// The response schema maps onto ai.AIResponse fields:
//
//	{ "text": "...", "physician_decision": "Approved"|"Rejected",
//	  "rejection_reason": "...", "prescription": {...}|null,
//	  "conditions": [...]|null, "investigations": [...]|null }
func (w *Worker) buildReviewSystemPrompt(c caseForReview) (string, error) {
	persona, err := w.loadPersona(c.AgentSlug)
	if err != nil {
		return "", err
	}

	// Parse EDIS AI response JSONB for structured prescription / conditions / investigations.
	var edis struct {
		Diagnosis *struct {
			Condition string `json:"condition"`
			Urgency   string `json:"urgency"`
		} `json:"diagnosis"`
		Prescription   *ai.Prescription    `json:"prescription"`
		Conditions     []ai.ConditionScore `json:"conditions"`
		Investigations []ai.Investigation  `json:"investigations"`
	}
	if c.AIResponse != "" && c.AIResponse != "{}" {
		_ = json.Unmarshal([]byte(c.AIResponse), &edis)
	}

	var sb strings.Builder
	sb.WriteString(persona)
	sb.WriteString("\n\n---\n\n")
	sb.WriteString("## CASE REVIEW TASK\n\n")
	sb.WriteString("You are performing a formal clinical review of the EDIS AI-generated diagnosis for this patient. ")
	sb.WriteString("This is your final validation step before the case is closed. ")
	sb.WriteString("Your decision carries full medical authority as the assigned physician.\n\n")
	sb.WriteString("---\n\n")

	// Patient profile section.
	sb.WriteString("### PATIENT INFORMATION\n")
	fmt.Fprintf(&sb, "**Name:** %s\n", c.PatientName)
	if c.BloodType != "" || c.Genotype != "" {
		if c.BloodType != "" {
			fmt.Fprintf(&sb, "**Blood Type:** %s", c.BloodType)
		}
		if c.Genotype != "" {
			if c.BloodType != "" {
				sb.WriteString("  |  ")
			}
			fmt.Fprintf(&sb, "**Genotype:** %s", c.Genotype)
		}
		sb.WriteString("\n")
	}
	allergies := c.Allergies
	if allergies == "" {
		allergies = "None recorded"
	}
	fmt.Fprintf(&sb, "**Known Allergies:** %s\n", allergies)
	if c.MedicalHistory != "" {
		fmt.Fprintf(&sb, "**Medical History:** %s\n", c.MedicalHistory)
	}
	if c.CurrentMedications != "" {
		fmt.Fprintf(&sb, "**Current Medications:** %s\n", c.CurrentMedications)
	}
	sb.WriteString("\n---\n\n")

	// Case details section.
	sb.WriteString("### CASE DETAILS\n")
	if c.CaseTitle != "" {
		fmt.Fprintf(&sb, "**Chief Complaint:** %s\n", c.CaseTitle)
	}
	if c.CaseDesc != "" {
		fmt.Fprintf(&sb, "**Presenting Symptoms:** %s\n", c.CaseDesc)
	}
	if hpi := extractHPIText(c.HPI); hpi != "" {
		fmt.Fprintf(&sb, "**History of Presenting Illness:** %s\n", hpi)
	}
	sb.WriteString("\n---\n\n")

	// EDIS diagnostic output section.
	sb.WriteString("### EDIS AI DIAGNOSTIC OUTPUT\n\n")

	condition := c.Condition
	urgency := c.Urgency
	if edis.Diagnosis != nil {
		if edis.Diagnosis.Condition != "" {
			condition = edis.Diagnosis.Condition
		}
		if edis.Diagnosis.Urgency != "" {
			urgency = edis.Diagnosis.Urgency
		}
	}
	if condition != "" {
		fmt.Fprintf(&sb, "**Primary Diagnosis:** %s", condition)
		if urgency != "" {
			fmt.Fprintf(&sb, " (%s urgency)", urgency)
		}
		sb.WriteString("\n\n")
	}

	if len(edis.Conditions) > 0 {
		sb.WriteString("**Differential Diagnoses:**\n")
		for i, cond := range edis.Conditions {
			fmt.Fprintf(&sb, "%d. %s — %d%% confidence — %s\n",
				i+1, cond.Condition, cond.Confidence, cond.Description)
		}
		sb.WriteString("\n")
	}

	if p := edis.Prescription; p != nil {
		sb.WriteString("**Recommended Prescription:**\n")
		if p.Medicine != "" {
			fmt.Fprintf(&sb, "- Medicine: %s\n", p.Medicine)
		}
		if p.Dosage != "" {
			fmt.Fprintf(&sb, "- Dosage: %s\n", p.Dosage)
		}
		if p.Frequency != "" {
			fmt.Fprintf(&sb, "- Frequency: %s\n", p.Frequency)
		}
		if p.Duration != "" {
			fmt.Fprintf(&sb, "- Duration: %s\n", p.Duration)
		}
		if p.Instructions != "" {
			fmt.Fprintf(&sb, "- Instructions: %s\n", p.Instructions)
		}
		sb.WriteString("\n")
	}

	if len(edis.Investigations) > 0 {
		sb.WriteString("**Recommended Investigations:**\n")
		for _, inv := range edis.Investigations {
			fmt.Fprintf(&sb, "- %s — %s (%s)\n", inv.Test, inv.Reason, inv.Urgency)
		}
		sb.WriteString("\n")
	}

	sb.WriteString("---\n\n")
	sb.WriteString("## YOUR REVIEW DECISION\n\n")
	sb.WriteString("Respond with ONLY valid JSON matching this exact schema (no markdown fences, no prose):\n\n")
	sb.WriteString("{\n")
	sb.WriteString("  \"text\": \"Your clinical chart notes (2-3 sentences of physician reasoning, written as chart documentation)\",\n")
	sb.WriteString("  \"physician_decision\": \"Approved\",\n")
	sb.WriteString("  \"rejection_reason\": \"\",\n")
	sb.WriteString("  \"prescription\": null,\n")
	sb.WriteString("  \"conditions\": null,\n")
	sb.WriteString("  \"investigations\": null\n")
	sb.WriteString("}\n\n")
	sb.WriteString("CLINICAL REVIEW RULES:\n")
	sb.WriteString("- `physician_decision` MUST be exactly \"Approved\" or \"Rejected\"\n")
	sb.WriteString("- `text` is ALWAYS required — write as physician chart documentation, not patient-facing prose\n")
	sb.WriteString("- `rejection_reason` is required only when physician_decision is \"Rejected\" — state what is clinically unsafe or incorrect\n")
	sb.WriteString("- Set `prescription` only if modifying the EDIS prescription; use null to accept as-is\n")
	sb.WriteString("- Set `conditions` only if reordering or amending the differential; use null to accept as-is\n")
	sb.WriteString("- Set `investigations` only if modifying recommended tests; use null to accept as-is\n")
	sb.WriteString("- CRITICAL: check patient allergies against any prescription before approving\n")
	sb.WriteString("- CRITICAL: check for drug interactions with current medications\n")
	sb.WriteString("- Reject ONLY when the EDIS output is clinically unsafe or significantly incorrect\n")
	sb.WriteString("- Respond ONLY with the JSON object — no markdown, no explanations outside the JSON\n")

	return sb.String(), nil
}

// buildSystemPrompt constructs the patient-facing reply system prompt for the
// AI physician.  It embeds the agent persona and current case context so the AI
// can respond naturally as the patient's assigned doctor.
func (w *Worker) buildSystemPrompt(c caseNeedingReply) (string, error) {
	persona, err := w.loadPersona(c.AgentSlug)
	if err != nil {
		return "", err
	}

	// First name only for natural address.
	firstName := firstWord(c.PatientName)

	var sb strings.Builder
	sb.WriteString(persona)
	sb.WriteString("\n\n---\n\n")
	sb.WriteString("## ACTIVE PATIENT CASE\n\n")
	fmt.Fprintf(&sb, "**Patient:** %s", c.PatientName)
	if c.PatientGender != "" {
		fmt.Fprintf(&sb, " (%s)", c.PatientGender)
	}
	sb.WriteString("\n")
	if c.Language != "" && strings.ToLower(c.Language) != "english" {
		fmt.Fprintf(&sb, "**Preferred Language:** %s\n", c.Language)
	}
	if c.CaseTitle != "" {
		fmt.Fprintf(&sb, "**Chief Complaint:** %s\n", c.CaseTitle)
	}
	if c.CaseDesc != "" {
		fmt.Fprintf(&sb, "**Presenting Symptoms:** %s\n", c.CaseDesc)
	}
	if c.Condition != "" {
		fmt.Fprintf(&sb, "**EDIS Probable Condition:** %s", c.Condition)
		if c.Urgency != "" {
			fmt.Fprintf(&sb, " (%s urgency)", c.Urgency)
		}
		sb.WriteString("\n")
	}
	if c.HPI != "" && c.HPI != "null" {
		hpiText := extractHPIText(c.HPI)
		if hpiText != "" {
			fmt.Fprintf(&sb, "**History of Presenting Illness:** %s\n", hpiText)
		}
	}

	sb.WriteString("\n---\n\n")
	sb.WriteString("## YOUR TASK\n\n")
	sb.WriteString("You are communicating directly with this patient. Review the EDIS analysis above and respond as their assigned physician.\n\n")
	sb.WriteString("**STRICT RESPONSE RULES:**\n")
	sb.WriteString("- Write 2–3 sentences maximum in plain, compassionate language.\n")
	if firstName != "" {
		fmt.Fprintf(&sb, "- Address the patient as \"%s\" (first name only).\n", firstName)
	}
	sb.WriteString("- Acknowledge the EDIS finding and offer your clinical perspective or confirm it.\n")
	sb.WriteString("- Close with a clear, actionable next step (medication, rest, hospital visit, follow-up).\n")
	sb.WriteString("- Use 1–2 relevant emojis naturally — do not overuse them.\n")
	sb.WriteString("- Do NOT mention EDIS, AI, algorithms, or any technology — speak as a human physician.\n")
	sb.WriteString("- Do NOT use medical jargon without immediately explaining it in plain terms.\n")
	sb.WriteString("- Respond with ONLY a JSON object containing a single 'text' field with your message.\n")
	sb.WriteString("  Example: {\"text\": \"Hello, I've reviewed your results and...\"}\n")
	sb.WriteString("  No other JSON fields, no markdown, no prose outside the JSON object.\n")

	return sb.String(), nil
}

// loadPersona reads AGENT.md + SOUL.md for the given slug, concatenates them,
// and caches the result.  The cache is never invalidated — restart to reload.
func (w *Worker) loadPersona(slug string) (string, error) {
	w.personaMu.RLock()
	cached, ok := w.personaCache[slug]
	w.personaMu.RUnlock()
	if ok {
		return cached, nil
	}

	agentPath := filepath.Join(w.agentsDir, slug, "AGENT.md")
	soulPath := filepath.Join(w.agentsDir, slug, "SOUL.md")

	agentBytes, err := os.ReadFile(agentPath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", agentPath, err)
	}
	soulBytes, err := os.ReadFile(soulPath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", soulPath, err)
	}

	combined := string(agentBytes) + "\n\n---\n\n" + string(soulBytes)

	w.personaMu.Lock()
	w.personaCache[slug] = combined
	w.personaMu.Unlock()

	// Also cache the physician display name extracted from the slug.
	name := slugToName(slug)
	w.nameMu.Lock()
	w.nameCache[slug] = name
	w.nameMu.Unlock()

	return combined, nil
}

// cachedPhysicianName returns a display name for the agent slug.
func (w *Worker) cachedPhysicianName(slug string) string {
	w.nameMu.RLock()
	name, ok := w.nameCache[slug]
	w.nameMu.RUnlock()
	if ok {
		return name
	}
	return slugToName(slug)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// buildChatMessages converts IM history rows to ai.ChatMessage entries.
// IM sender_role "user" → AI role "user"; "professional" → "assistant".
func buildChatMessages(history []imMessage) []ai.ChatMessage {
	msgs := make([]ai.ChatMessage, 0, len(history))
	for _, m := range history {
		role := "user"
		if m.SenderRole == "professional" {
			role = "assistant"
		}
		msgs = append(msgs, ai.ChatMessage{Role: role, Text: m.Content})
	}
	return msgs
}

// broadcastNewMessage pushes an im.message WebSocket event to the patient.
func (w *Worker) broadcastNewMessage(msgID, caseID, patientID, physicianID, physicianName, content string) {
	if w.hub == nil || patientID == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"id":           msgID,
		"diagnosis_id": caseID,
		"sender_id":    physicianID,
		"sender_role":  "professional",
		"sender_name":  physicianName,
		"content":      content,
		"created_at":   time.Now().UTC().Format(time.RFC3339),
		"read_at":      nil,
	})
	w.hub.BroadcastToUser(patientID, "im.message", payload)
}

// slugToName converts a slug like "dr-ahmed-musa" to "Dr. Ahmed Musa".
func slugToName(slug string) string {
	parts := strings.Split(slug, "-")
	if len(parts) == 0 {
		return slug
	}
	result := make([]string, 0, len(parts))
	for i, p := range parts {
		if i == 0 && strings.ToLower(p) == "dr" {
			result = append(result, "Dr.")
		} else if p != "" {
			result = append(result, strings.ToUpper(p[:1])+p[1:])
		}
	}
	return strings.Join(result, " ")
}

// firstWord returns the first space-separated word of s, or empty string.
func firstWord(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	idx := strings.IndexByte(s, ' ')
	if idx < 0 {
		return s
	}
	return s[:idx]
}

// extractHPIText tries to extract a readable summary from raw HPI JSON.
// Returns empty string on any parse error.
func extractHPIText(raw string) string {
	if raw == "" || raw == "null" {
		return ""
	}
	var hpi struct {
		Onset         string `json:"onset"`
		Duration      string `json:"duration"`
		Location      string `json:"location"`
		Character     string `json:"character"`
		SeverityScore int    `json:"severityScore"`
	}
	if err := json.Unmarshal([]byte(raw), &hpi); err != nil {
		return ""
	}
	parts := []string{}
	if hpi.Onset != "" {
		parts = append(parts, "onset: "+hpi.Onset)
	}
	if hpi.Duration != "" {
		parts = append(parts, "duration: "+hpi.Duration)
	}
	if hpi.Location != "" {
		parts = append(parts, "location: "+hpi.Location)
	}
	if hpi.Character != "" {
		parts = append(parts, "character: "+hpi.Character)
	}
	if hpi.SeverityScore > 0 {
		parts = append(parts, fmt.Sprintf("severity: %d/10", hpi.SeverityScore))
	}
	return strings.Join(parts, "; ")
}
