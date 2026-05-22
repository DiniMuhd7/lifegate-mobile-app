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
	if err := w.repo.InsertPhysicianMessage(ctx, c.CaseID, c.PhysicianID, physicianName, replyText); err != nil {
		return fmt.Errorf("insert physician message: %w", err)
	}

	// 5. Broadcast the new message to the patient via WebSocket.
	w.broadcastNewMessage(c.CaseID, c.PatientID, c.PhysicianID, physicianName, replyText)

	log.Printf("[openclaw-worker] replied to case %s (agent=%s, patient=%s)",
		c.CaseID, c.AgentSlug, c.PatientID)
	return nil
}

// ── Completion cycle ─────────────────────────────────────────────────────────

func (w *Worker) runCompletionCycle(ctx context.Context) {
	cases, err := w.repo.ListCompletableCases(ctx, completeBatchLimit)
	if err != nil {
		log.Printf("[openclaw-worker] list completable cases: %v", err)
		return
	}

	for _, c := range cases {
		if err := w.handleCompletion(ctx, c); err != nil {
			log.Printf("[openclaw-worker] complete case %s: %v", c.CaseID, err)
		}
	}
}

func (w *Worker) handleCompletion(ctx context.Context, c completableCase) error {
	patientID, err := w.repo.CompleteCase(ctx, c.CaseID, c.PhysicianID)
	if err != nil {
		return err
	}
	if patientID == "" {
		return nil // already completed — idempotent
	}

	// Notify the patient via WebSocket.
	if w.hub != nil && patientID != "" {
		payload, _ := json.Marshal(map[string]string{
			"diagnosisId": c.CaseID,
			"status":      "Completed",
		})
		w.hub.BroadcastToUser(patientID, "diagnosis.update", payload)
	}

	// Notify all physicians so their queues refresh.
	if w.hub != nil {
		queuePayload, _ := json.Marshal(map[string]string{
			"caseId": c.CaseID,
			"status": "Completed",
		})
		w.hub.BroadcastToRole("professional", "physician.review.status", queuePayload)
	}

	// Optional push notification to patient.
	if w.push != nil && patientID != "" {
		w.push.SendToUser(ctx, patientID,
			"Case Reviewed",
			"Your case has been reviewed and completed by your physician. Check the app for your results.",
			map[string]string{"type": "case_completed", "diagnosisId": c.CaseID},
		)
	}

	log.Printf("[openclaw-worker] completed case %s (physician=%s, patient=%s)",
		c.CaseID, c.PhysicianID, patientID)
	return nil
}

// ── System prompt builder ────────────────────────────────────────────────────

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
	sb.WriteString("- Respond ONLY with the message text — no JSON, no markdown headers, no labels.\n")

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
func (w *Worker) broadcastNewMessage(caseID, patientID, physicianID, physicianName, content string) {
	if w.hub == nil || patientID == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
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
