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

type openAIProvider struct {
apiKey string
model  string
}

func NewOpenAIProvider(cfg *config.Config) AIProvider {
return &openAIProvider{apiKey: cfg.OpenAIAPIKey, model: cfg.OpenAIModel}
}

func (o *openAIProvider) Name() string { return "openai" }

func (o *openAIProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
type openAIMessage struct {
Role    string `json:"role"`
Content string `json:"content"`
}

msgs := []openAIMessage{{Role: "system", Content: systemPrompt}}
for _, m := range messages {
role := "user"
if strings.EqualFold(m.Role, "AI") {
role = "assistant"
}
msgs = append(msgs, openAIMessage{Role: role, Content: m.Text})
}

body := map[string]interface{}{
"model":       o.model,
"messages":    msgs,
"temperature": 0.7,
}
payload, err := json.Marshal(body)
if err != nil {
return nil, err
}

req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(payload))
if err != nil {
return nil, err
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+o.apiKey)

resp, err := http.DefaultClient.Do(req)
if err != nil {
return nil, err
}
defer resp.Body.Close()

if resp.StatusCode != http.StatusOK {
b, _ := io.ReadAll(resp.Body)
return nil, fmt.Errorf("openai error %d: %s", resp.StatusCode, string(b))
}

var result struct {
Choices []struct {
Message struct {
Content string `json:"content"`
} `json:"message"`
} `json:"choices"`
}
if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
return nil, err
}
if len(result.Choices) == 0 {
return nil, fmt.Errorf("openai returned no choices")
}

return parseAIResponse(result.Choices[0].Message.Content)
}

func parseAIResponse(content string) (*AIResponse, error) {
// Extract JSON from the response (may be wrapped in markdown code fences)
content = strings.TrimSpace(content)
if idx := strings.Index(content, "```json"); idx != -1 {
content = content[idx+7:]
if end := strings.Index(content, "```"); end != -1 {
content = content[:end]
}
} else if idx := strings.Index(content, "```"); idx != -1 {
content = content[idx+3:]
if end := strings.Index(content, "```"); end != -1 {
content = content[:end]
}
}
content = strings.TrimSpace(content)

var aiResp AIResponse
if err := json.Unmarshal([]byte(content), &aiResp); err != nil {
// Fallback: return raw text
return &AIResponse{Text: content}, nil
}
return &aiResp, nil
}
