package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

type claudeCodeProvider struct {
	apiKey string
	model  string
}

func NewClaudeCodeProvider(cfg *config.Config) AIProvider {
	return &claudeCodeProvider{apiKey: cfg.AnthropicAPIKey, model: cfg.ClaudeCodeModel}
}

func (cl *claudeCodeProvider) Name() string { return "claude-code" }

func (cl *claudeCodeProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
	type claudeMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	var msgs []claudeMessage
	for _, m := range messages {
		role := "user"
		if strings.EqualFold(m.Role, "AI") {
			role = "assistant"
		}
		msgs = append(msgs, claudeMessage{Role: role, Content: m.Text})
	}

	body := map[string]interface{}{
		"model":      cl.model,
		"max_tokens": 4096,
		"system":     systemPrompt,
		"messages":   msgs,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", cl.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("claude-code error %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Content) == 0 {
		return nil, fmt.Errorf("claude-code returned empty content")
	}

	return parseAIResponse(result.Content[0].Text)
}
