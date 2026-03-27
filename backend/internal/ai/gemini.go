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

type geminiProvider struct {
apiKey string
model  string
}

func NewGeminiProvider(cfg *config.Config) AIProvider {
return &geminiProvider{apiKey: cfg.GeminiAPIKey, model: cfg.GeminiModel}
}

func (g *geminiProvider) Name() string { return "gemini" }

func (g *geminiProvider) Chat(ctx context.Context, systemPrompt string, messages []ChatMessage) (*AIResponse, error) {
type part struct {
Text string `json:"text"`
}
type content struct {
Role  string `json:"role"`
Parts []part `json:"parts"`
}

var contents []content
// Prepend system prompt as first user message
contents = append(contents, content{
Role:  "user",
Parts: []part{{Text: systemPrompt}},
})
contents = append(contents, content{
Role:  "model",
Parts: []part{{Text: "Understood. I will respond as LifeGate health assistant in the JSON format specified."}},
})
for _, m := range messages {
role := "user"
if strings.EqualFold(m.Role, "AI") {
role = "model"
}
contents = append(contents, content{Role: role, Parts: []part{{Text: m.Text}}})
}

body := map[string]interface{}{
"contents": contents,
"generationConfig": map[string]interface{}{
"temperature": 0.7,
},
}
payload, err := json.Marshal(body)
if err != nil {
return nil, err
}

url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", g.model, g.apiKey)
req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
if err != nil {
return nil, err
}
req.Header.Set("Content-Type", "application/json")

resp, err := http.DefaultClient.Do(req)
if err != nil {
return nil, err
}
defer resp.Body.Close()

if resp.StatusCode != http.StatusOK {
b, _ := io.ReadAll(resp.Body)
return nil, fmt.Errorf("gemini error %d: %s", resp.StatusCode, string(b))
}

var result struct {
Candidates []struct {
Content struct {
Parts []struct {
Text string `json:"text"`
} `json:"parts"`
} `json:"content"`
} `json:"candidates"`
}
if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
return nil, err
}
if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
return nil, fmt.Errorf("gemini returned no candidates")
}

return parseAIResponse(result.Candidates[0].Content.Parts[0].Text)
}
