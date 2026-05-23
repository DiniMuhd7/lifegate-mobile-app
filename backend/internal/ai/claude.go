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

type claudeProvider struct {
apiKey string
model  string
}

func NewClaudeProvider(cfg *config.Config) AIProvider {
return &claudeProvider{apiKey: cfg.AnthropicAPIKey, model: cfg.AnthropicModel}
}

func (cl *claudeProvider) Name() string { return "claude" }

func (cl *claudeProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
type claudeMessage struct {
Role    string `json:"role"`
Content string `json:"content"`
}

var msgs []claudeMessage
for _, m := range messages {
role := "user"
content := m.Text
if strings.EqualFold(m.Role, "AI") || strings.EqualFold(m.Role, "assistant") {
role = "assistant"
} else if strings.EqualFold(m.Role, "SYSTEM") {
// Anthropic messages API does not support a "system" role in the messages
// list — prepend a clear label so the model knows this is injected context,
// not patient speech.
content = "[EDIS Clinical Context — not patient input]:\n" + m.Text
}
msgs = append(msgs, claudeMessage{Role: role, Content: content})
}

body := map[string]interface{}{
"model":      cl.model,
"max_tokens": 2048,
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
return nil, fmt.Errorf("claude error %d: %s", resp.StatusCode, string(b))
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
return nil, fmt.Errorf("claude returned empty content")
}

return parseAIResponse(result.Content[0].Text)
}
