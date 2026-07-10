// Package genai — voicechat.go
//
// VoiceChat implements the single-turn voice-chat pipeline used by the
// mobile Gemini-Live-style voice screen:
//
//  1. User audio  →  Whisper transcription (re-uses TranscribeAudio)
//  2. Transcript  →  EDIS Chat              (re-uses Chat — language-aware)
//  3. AI text     →  OpenAI TTS (mp3)       (new — synthesizeTTS)
//  4. Returns {transcript, replyText, audioBase64, aiResponse}
//
// The AI response goes through the exact same EDIS language-enforcement path
// as a text chat turn, so the patient's preferred language (from their profile)
// is respected for both the text reply and — indirectly — the TTS read-out
// (the TTS model reads whatever language the text is in).

package genai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
)

// ─── Request / Response types ─────────────────────────────────────────────────

// VoiceChatRequest holds everything needed for a single voice-chat turn.
type VoiceChatRequest struct {
	// Audio payload from the multipart upload.
	AudioData     []byte
	AudioFilename string
	AudioMimeType string

	// Full conversation history (same format as /genai/chat) so EDIS can
	// maintain context across turns in the live voice session.
	PreviousMessages []ai.ChatMessage

	// Category mirrors the text-chat category field (e.g. "general_health").
	Category string

	// UserID is injected from the JWT middleware — never trusted from the body.
	UserID string
}

// VoiceChatResponse is returned as JSON to the mobile client.
type VoiceChatResponse struct {
	// Transcript is the Whisper-transcribed text of the user's audio input.
	Transcript string `json:"transcript"`

	// ReplyText is the plain-text AI response for display in the chat history
	// bubble that the mobile app adds after each voice turn.
	ReplyText string `json:"replyText"`

	// AudioBase64 is the OpenAI TTS audio (mp3) encoded as standard base64.
	// The client decodes it to a temp file and plays it with expo-av.
	// Empty string when TTS is unavailable (no OpenAI key) — the client
	// falls back to displaying the text reply only.
	AudioBase64 string `json:"audioBase64"`

	// AIResponse embeds the full EDIS structured response so the mobile
	// chat-store can update its conversation state identically to a text turn
	// (diagnosis cards, follow-up questions, conditions, risk flags, etc.).
	AIResponse *ChatResponse `json:"aiResponse,omitempty"`
}

// ─── Service method ───────────────────────────────────────────────────────────

// VoiceChat performs one complete voice-chat round trip.
func (s *Service) VoiceChat(ctx context.Context, req VoiceChatRequest) (*VoiceChatResponse, error) {
	// ── 1. Transcribe user audio via Whisper ─────────────────────────────────
	if len(req.AudioData) < 512 {
		return nil, fmt.Errorf("audio too short to transcribe")
	}
	transcript, err := s.TranscribeAudio(ctx, req.AudioData, req.AudioFilename, req.AudioMimeType)
	if err != nil {
		return nil, fmt.Errorf("transcription failed: %w", err)
	}
	if strings.TrimSpace(transcript) == "" {
		return nil, fmt.Errorf("no speech detected in audio")
	}

	// ── 2. EDIS Chat (identical to POST /genai/chat) ────────────────────────
	// This path runs the full EDIS language-enforcement pass so the AI reply
	// is always in the patient's preferred language.
	chatResp, err := s.Chat(ctx, ChatRequest{
		Message:          transcript,
		PreviousMessages: req.PreviousMessages,
		UserID:           req.UserID,
		Category:         req.Category,
	})
	if err != nil || chatResp == nil {
		return nil, fmt.Errorf("AI chat failed: %w", err)
	}

	// ── 3. TTS — synthesise the reply for hands-free playback ───────────────
	// TTS is best-effort: a failure here should never block the response since
	// the text reply is always available as a fallback.
	var audioBase64 string
	if s.openAIKey != "" && strings.TrimSpace(chatResp.Text) != "" {
		audioBytes, ttsErr := s.synthesizeTTS(ctx, chatResp.Text)
		if ttsErr != nil {
			log.Printf("[VoiceChat] TTS non-fatal error: %v", ttsErr)
		} else if len(audioBytes) > 0 {
			audioBase64 = base64.StdEncoding.EncodeToString(audioBytes)
		}
	}

	return &VoiceChatResponse{
		Transcript:  transcript,
		ReplyText:   chatResp.Text,
		AudioBase64: audioBase64,
		AIResponse:  chatResp,
	}, nil
}

// synthesizeTTS calls the OpenAI TTS API and returns mp3 audio bytes.
// We use mp3 (not opus) because expo-av plays mp3 natively on all platforms
// without any native codec installation.  The "shimmer" voice is a warm,
// clear female voice that suits a health-assistant persona.
func (s *Service) synthesizeTTS(ctx context.Context, text string) ([]byte, error) {
	// Truncate very long responses — TTS is slow past ~600 chars and the mobile
	// speaker UX benefits from shorter, punchy replies anyway.
	const maxChars = 700
	runes := []rune(text)
	if len(runes) > maxChars {
		text = string(runes[:maxChars]) + "…"
	}

	body, err := json.Marshal(map[string]string{
		"model":           "tts-1",
		"input":           text,
		"voice":           "shimmer",   // warm, professional female voice
		"response_format": "mp3",
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		"https://api.openai.com/v1/audio/speech",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.openAIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("TTS API %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}
