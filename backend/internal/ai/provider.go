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
  "diagnosis": { "condition": "...", "urgency": "LOW|MEDIUM|HIGH|CRITICAL", "description": "..." },
  "prescription": { "medicine": "...", "dosage": "...", "frequency": "...", "duration": "...", "instructions": "..." }
}
diagnosis and prescription are optional — only include when clinically appropriate.
You must include a disclaimer that this is AI-assisted guidance and physician review is recommended.`

type ChatMessage struct {
Role string
Text string
}

type Diagnosis struct {
Condition   string `json:"condition"`
Urgency     string `json:"urgency"`
Description string `json:"description"`
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
case "gemini":
return NewGeminiProvider(cfg)
case "claude":
return NewClaudeProvider(cfg)
case "auto":
return &autoProvider{providers: []AIProvider{
NewOpenAIProvider(cfg),
NewGeminiProvider(cfg),
NewClaudeProvider(cfg),
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
