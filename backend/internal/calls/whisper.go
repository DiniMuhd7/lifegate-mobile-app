// Package calls — whisper.go: OpenAI Whisper speech-to-text.
//
// Transcribe sends a raw OGG/Opus audio buffer to the Whisper v1 API and
// returns the transcript as a plain string.
package calls

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
)

const whisperEndpoint = "https://api.openai.com/v1/audio/transcriptions"

// Transcribe sends oggData (a valid OGG/Opus file) to the Whisper API and
// returns the recognised text.  Returns an empty string (no error) when the
// audio contains only silence or unintelligible content.
func Transcribe(ctx context.Context, apiKey string, oggData []byte) (string, error) {
	if len(oggData) == 0 {
		return "", nil
	}

	// Build multipart form body.
	var body bytes.Buffer
	w := multipart.NewWriter(&body)

	// "file" part — name it "audio.ogg" so the API infers the codec.
	fh := make(textproto.MIMEHeader)
	fh.Set("Content-Disposition", `form-data; name="file"; filename="audio.ogg"`)
	fh.Set("Content-Type", "audio/ogg")
	fw, err := w.CreatePart(fh)
	if err != nil {
		return "", fmt.Errorf("whisper: create part: %w", err)
	}
	if _, err := fw.Write(oggData); err != nil {
		return "", fmt.Errorf("whisper: write audio: %w", err)
	}

	// "model" part.
	if err := w.WriteField("model", "whisper-1"); err != nil {
		return "", fmt.Errorf("whisper: write model field: %w", err)
	}

	// "response_format" part — plain text is easiest to consume.
	if err := w.WriteField("response_format", "text"); err != nil {
		return "", fmt.Errorf("whisper: write response_format field: %w", err)
	}

	w.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, whisperEndpoint, &body)
	if err != nil {
		return "", fmt.Errorf("whisper: build request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("whisper: http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		// Surface a helpful error but don't crash the call session.
		var apiErr struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(respBytes, &apiErr)
		if apiErr.Error.Message != "" {
			return "", fmt.Errorf("whisper: API error %d: %s", resp.StatusCode, apiErr.Error.Message)
		}
		return "", fmt.Errorf("whisper: API error %d", resp.StatusCode)
	}

	// response_format=text returns a plain UTF-8 string (may have trailing newline).
	return string(bytes.TrimSpace(respBytes)), nil
}
