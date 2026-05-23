// Package calls — tts.go: OpenAI Text-to-Speech.
//
// Synthesize converts a text string to OGG/Opus audio using the OpenAI TTS
// API.  The returned bytes are a valid OGG/Opus file that can be parsed by
// ParseOggOpus and injected into a Pion audio track.
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

const ttsEndpoint = "https://api.openai.com/v1/audio/speech"

// voiceForSlug picks an OpenAI TTS voice that matches the physician's gender.
// OpenAI voices: alloy (neutral), echo (male), fable (male), onyx (male),
// nova (female), shimmer (female).
//
// The slug encodes the physician's full name, e.g. "dr-ngozi-okafor".
// Female first names that appear in the OpenClaw roster are listed here; all
// others default to a male voice.
var femaleFirstNames = map[string]bool{
	"ngozi": true, "amara": true, "chisom": true, "blessing": true,
	"adaeze": true, "fatima": true, "aisha": true, "zainab": true,
	"halima": true, "nkechi": true, "ifeoma": true, "uchenna": true,
	"folake": true, "yetunde": true, "sade": true, "bunmi": true,
}

// VoiceForSlug returns the OpenAI TTS voice id for the given agent slug.
func VoiceForSlug(slug string) string {
	parts := strings.Split(strings.ToLower(slug), "-")
	// slug format: "dr-<first>-<last>" — first name is parts[1]
	if len(parts) >= 2 {
		first := parts[1]
		if femaleFirstNames[first] {
			return "nova" // warm, professional female voice
		}
	}
	return "echo" // clear, professional male voice
}

// Synthesize calls the OpenAI TTS API and returns a valid OGG/Opus byte
// stream for the given text.  voice is an OpenAI voice ID (e.g. "nova",
// "echo").  Pass an empty string to use the default ("echo").
func Synthesize(ctx context.Context, apiKey, text, voice string) ([]byte, error) {
	if strings.TrimSpace(text) == "" {
		return nil, nil
	}
	if voice == "" {
		voice = "echo"
	}

	body, err := json.Marshal(map[string]string{
		"model":           "tts-1",
		"input":           text,
		"voice":           voice,
		"response_format": "opus", // OGG/Opus container — directly parseable by ParseOggOpus
	})
	if err != nil {
		return nil, fmt.Errorf("tts: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ttsEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("tts: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tts: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("tts: API error %d: %s", resp.StatusCode, string(b))
	}

	return io.ReadAll(resp.Body)
}
