package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

type codexProvider struct {
	apiKey string
	model  string
}

func NewCodexProvider(cfg *config.Config) AIProvider {
	return &codexProvider{apiKey: cfg.OpenAIAPIKey, model: cfg.CodexModel}
}

func (c *codexProvider) Name() string { return "codex" }

func (c *codexProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
	type codexMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	var msgs []codexMessage
	for _, m := range messages {
		role := "assistant"
		if m.Role == "USER" {
			role = "user"
		}
		msgs = append(msgs, codexMessage{Role: role, Content: m.Text})
	}

	body := map[string]interface{}{
		"model":        c.model,
		"instructions": systemPrompt,
		"input":        msgs,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("codex error %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		Output []struct {
			Type    string `json:"type"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	for _, item := range result.Output {
		if item.Type == "message" {
			for _, c := range item.Content {
				if c.Type == "output_text" {
					return parseAIResponse(c.Text)
				}
			}
		}
	}

	return nil, fmt.Errorf("codex returned no output")
}
