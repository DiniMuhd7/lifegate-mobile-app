package ai

import (
"bytes"
"context"
"encoding/json"
"fmt"
"io"
"net/http"
"strings"
"time"

"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

var httpClient = &http.Client{Timeout: 60 * time.Second}

type openAIProvider struct {
apiKey string
model  string
}

func NewOpenAIProvider(cfg *config.Config) AIProvider {
return &openAIProvider{apiKey: cfg.OpenAIAPIKey, model: cfg.OpenAIModel}
}

func (o *openAIProvider) Name() string { return "openai" }

func (o *openAIProvider) Model() string { return o.model }

func (o *openAIProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
type openAIMessage struct {
Role    string `json:"role"`
Content string `json:"content"`
}

msgs := []openAIMessage{{Role: "system", Content: systemPrompt}}
for _, m := range messages {
role := "user"
		if strings.EqualFold(m.Role, "AI") || strings.EqualFold(m.Role, "assistant") {
role = "system"
}
msgs = append(msgs, openAIMessage{Role: role, Content: m.Text})
}

body := map[string]interface{}{
"model":           o.model,
"messages":        msgs,
"temperature":     0.7,
"response_format": map[string]string{"type": "json_object"},
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

resp, err := httpClient.Do(req)
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
	content = strings.TrimSpace(content)

	// Strip markdown code fences if present (```json ... ``` or ``` ... ```).
	for _, fence := range []string{"```json", "```JSON", "```"} {
		if idx := strings.Index(content, fence); idx != -1 {
			content = content[idx+len(fence):]
			if end := strings.Index(content, "```"); end != -1 {
				content = content[:end]
			}
			content = strings.TrimSpace(content)
			break
		}
	}

	// Extract the outermost JSON object, discarding any prose before/after it.
	// Use brace counting so nested objects don't confuse the extraction.
	start := strings.Index(content, "{")
	if start == -1 {
		return nil, fmt.Errorf("parseAIResponse: no JSON object found in AI response")
	}
	depth := 0
	end := -1
	inStr := false
	escaped := false
	for i := start; i < len(content); i++ {
		ch := content[i]
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' && inStr {
			escaped = true
			continue
		}
		if ch == '"' {
			inStr = !inStr
			continue
		}
		if inStr {
			continue
		}
		if ch == '{' {
			depth++
		} else if ch == '}' {
			depth--
			if depth == 0 {
				end = i
				break
			}
		}
	}

	if end == -1 {
		// JSON object was never closed — try best-effort close.
		content = content[start:] + "}"
	} else {
		content = content[start : end+1]
	}

	var aiResp AIResponse
	if err := json.Unmarshal([]byte(content), &aiResp); err != nil {
		// Return an error so the EDIS engine uses its user-safe graceful fallback
		// instead of forwarding raw JSON to the client as message text.
		return nil, fmt.Errorf("parseAIResponse: failed to unmarshal AI response: %w", err)
	}
	return &aiResp, nil
}
