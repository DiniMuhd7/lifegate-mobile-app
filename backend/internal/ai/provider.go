package ai

import (
"context"
"fmt"

"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

const HealthSystemPrompt = `You are LifeGate, an AI health assistant. Analyze symptoms and provide structured health guidance.
Always respond in valid JSON with this exact structure:
{
  "text": "conversational response",
  "diagnosis": { "condition": "...", "urgency": "LOW|MEDIUM|HIGH|CRITICAL", "description": "...", "confidence": 85 },
  "prescription": { "medicine": "...", "dosage": "...", "frequency": "...", "duration": "...", "instructions": "..." }
}
diagnosis and prescription are optional — only include when clinically appropriate.
The confidence field is an integer 0–100 representing how confident you are in the diagnosis based on the symptoms provided.
Always include a disclaimer that this is AI-assisted guidance and physician review is recommended.
For CRITICAL or HIGH urgency, strongly advise the user to seek immediate professional medical attention.`

// CategoryPromptSnippets provides additional context injected into the system prompt
// based on the conversation category selected by the user.
var CategoryPromptSnippets = map[string]string{
	"doctor_consultation": "Specialized focus: Help the user prepare for a medical consultation. Clarify when a doctor visit is necessary, how to describe symptoms effectively, what questions to ask, and what information to bring. Emphasize the importance of professional diagnosis.",
	"general_health":      "Specialized focus: Provide general wellness guidance, preventive care advice, healthy lifestyle habits, nutrition principles, exercise recommendations, and common health maintenance practices.",
	"eye_checkup":         "Specialized focus: Provide guidance on eye health. Cover common visual symptoms (blurred vision, eye pain, floaters, redness), when to see an ophthalmologist, what an eye examination involves, and tips for maintaining good eye health.",
	"hearing_test":        "Specialized focus: Provide guidance on hearing health. Cover signs of hearing loss, tinnitus, what an audiometry test involves, when to consult an audiologist, and hearing protection tips.",
	"mental_health":       "Specialized focus: Offer empathetic, non-judgmental mental health support. Cover stress management, anxiety, depression, sleep health, and emotional wellbeing. Always mention the value of professional mental health support. If signs of crisis are present, include the Nigeria emergency line (199) and encourage immediate help-seeking.",
}

type ChatMessage struct {
Role string
Text string
}

type Diagnosis struct {
Condition   string `json:"condition"`
Urgency     string `json:"urgency"`
Description string `json:"description"`
Confidence  int    `json:"confidence,omitempty"`
}

type Prescription struct {
Medicine     string `json:"medicine"`
Dosage       string `json:"dosage"`
Frequency    string `json:"frequency"`
Duration     string `json:"duration"`
Instructions string `json:"instructions"`
}

type AIResponse struct {
Text         string        `json:"text"`
Diagnosis    *Diagnosis    `json:"diagnosis,omitempty"`
Prescription *Prescription `json:"prescription,omitempty"`
}

type AIProvider interface {
Name() string
Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error)
}

func NewProvider(cfg *config.Config) AIProvider {
switch cfg.AIProvider {
case "openai":
return NewOpenAIProvider(cfg)
case "codex":
return NewCodexProvider(cfg)
case "claude":
return NewClaudeProvider(cfg)
case "claude-code":
return NewClaudeCodeProvider(cfg)
case "gemini":
return NewGeminiProvider(cfg)
case "auto":
return &autoProvider{providers: []AIProvider{
NewCodexProvider(cfg),
NewOpenAIProvider(cfg),
NewClaudeCodeProvider(cfg),
NewClaudeProvider(cfg),
NewGeminiProvider(cfg),
}}
default:
return NewOpenAIProvider(cfg)
}
}

type autoProvider struct {
providers []AIProvider
}

func (a *autoProvider) Name() string { return "auto" }

func (a *autoProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
var lastErr error
for _, p := range a.providers {
resp, err := p.Chat(ctx, systemPrompt, messages)
if err == nil {
return resp, nil
}
lastErr = err
}
return nil, fmt.Errorf("all AI providers failed; last error: %w", lastErr)
}
