// Package calls — voice_chat.go: GPT-4o conversational AI for live voice calls.
//
// Unlike the EDIS engine, voice responses must be natural spoken sentences —
// no JSON, no bullet points, nothing that sounds robotic when converted to
// speech.
package calls

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// voiceTurn holds one exchange in the live call transcript.
type voiceTurn struct {
	Patient   string // what the patient said (Whisper transcript)
	Physician string // what the AI physician replied
}

// voiceChatSystemPrompt builds the system prompt for the live voice call.
// It instructs GPT-4o to respond in natural, concise spoken English/Yoruba/etc.,
// staying in the OpenClaw physician persona, drawing on the case context.
func voiceChatSystemPrompt(agentPersona, physicianName, patientName, caseContext string) string {
	return fmt.Sprintf(`%s

---

You are currently on a LIVE PHONE CALL with your patient, %s.

CASE CONTEXT:
%s

VOICE CALL RULES (follow strictly):
1. Respond only in natural, conversational spoken language — NO markdown, NO
   bullet points, NO numbered lists, NO asterisks, NO JSON.
2. Keep each response to 2–4 sentences maximum.  This is a phone call; brevity is
   essential.
3. Start by briefly acknowledging what the patient just said, then respond.
4. Use commas and natural pauses; avoid complex sentence structures.
5. If you need to give medical instructions, speak them as a caring doctor would
   — "I'd like you to…", "Please make sure to…".
6. If the transcript appears empty or garbled, ask the patient to repeat themselves
   ("I'm sorry, could you say that again?").
7. Never reveal you are an AI.  Stay fully in character as Dr. %s.
8. Do not end the call unless the patient asks you to.
9. Match the patient's language where possible (English, Yoruba, Hausa, Igbo, etc.).
`, agentPersona, patientName, caseContext, physicianName)
}

// VoiceChat sends the latest patient transcript plus call history to GPT-4o and
// returns the physician's spoken reply.
func VoiceChat(
	ctx context.Context,
	apiKey, model string,
	agentPersona, physicianName, patientName, caseContext string,
	history []voiceTurn,
	patientTranscript string,
) (string, error) {
	if model == "" {
		model = "gpt-4o"
	}

	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	systemPrompt := voiceChatSystemPrompt(agentPersona, physicianName, patientName, caseContext)
	msgs := []msg{{Role: "system", Content: systemPrompt}}

	// Inject prior turns so the model has conversational continuity.
	for _, t := range history {
		if t.Patient != "" {
			msgs = append(msgs, msg{Role: "user", Content: t.Patient})
		}
		if t.Physician != "" {
			msgs = append(msgs, msg{Role: "assistant", Content: t.Physician})
		}
	}

	// Current patient utterance.
	userContent := strings.TrimSpace(patientTranscript)
	if userContent == "" {
		userContent = "[silence or inaudible]"
	}
	msgs = append(msgs, msg{Role: "user", Content: userContent})

	body, err := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    msgs,
		"temperature": 0.7,
		"max_tokens":  300, // ~3–4 spoken sentences
	})
	if err != nil {
		return "", fmt.Errorf("voice_chat: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		"https://api.openai.com/v1/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("voice_chat: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("voice_chat: http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("voice_chat: API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", fmt.Errorf("voice_chat: decode: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("voice_chat: no choices returned")
	}

	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}
