package genai

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ─── POST /api/genai/chat ─────────────────────────────────────────────────────

// Chat handles stateless AI chat requests (backward-compatible, no session required).
//
// @Summary      Stateless AI chat
// @Description  Sends a message to the AI provider and returns a response. For clinical_diagnosis category, credits are consumed.
// @Tags         genai
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{message=string,previousMessages=array,category=string}  true  "Chat request"
// @Success      200   {object}  object{success=bool,data=object,latency_ms=integer}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /genai/chat [post]
func (h *Handler) Chat(c *gin.Context) {
	start := time.Now()

	var req struct {
		Message          string           `json:"message" binding:"required"`
		PreviousMessages []ai.ChatMessage `json:"previousMessages"`
		Category         string           `json:"category"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	const maxMessageLen = 5000
	if len([]rune(req.Message)) > maxMessageLen {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Message exceeds maximum allowed length"})
		return
	}

	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	resp, err := h.svc.Chat(c.Request.Context(), ChatRequest{
		Message:          req.Message,
		PreviousMessages: req.PreviousMessages,
		UserID:           uid,
		Category:         req.Category,
		ContinuationDiagnosisID: strings.TrimSpace(c.Query("diagnosisId")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to process request"})
		return
	}

	latencyMs := time.Since(start).Milliseconds()
	c.Header("X-AI-Latency-Ms", fmt.Sprintf("%d", latencyMs))

	// Signal to the credit-gate middleware whether this turn updated an existing
	// case (no new credit should be consumed) or created a brand-new one.
	c.Set("is_existing_case", resp.IsExistingCase)

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"data":       resp,
		"latency_ms": latencyMs,
	})
}

// ─── POST /api/genai/health-check ────────────────────────────────────────────

// HealthCheck pings the underlying AI provider.
//
// @Summary      AI provider health check
// @Tags         genai
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,status=string}
// @Failure      503  {object}  object{success=bool,status=string,message=string}
// @Router       /genai/health-check [post]
func (h *Handler) HealthCheck(c *gin.Context) {
	if err := h.svc.HealthCheck(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"status":  "degraded",
			"message": "AI provider is currently unavailable",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "healthy",
	})
}

// ─── GET /api/genai/status ────────────────────────────────────────────────────

// Status returns the configured AI provider name and service status.
//
// @Summary      AI provider status
// @Tags         genai
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Router       /genai/status [get]
func (h *Handler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    h.svc.Status(),
	})
}

// ─── POST /api/chat/sessions/:id/ai-message ───────────────────────────────────

// ChatSession processes an AI message within an existing session.
//
// @Summary      Session-based AI chat
// @Description  Appends the user message to the session history, runs EDIS inference, and persists the AI reply.
// @Tags         chat-sessions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                               true  "Session ID"
// @Param        body  body      object{message=string,category=string}  true  "Message"
// @Success      200   {object}  object{success=bool,data=object,latency_ms=integer}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      404   {object}  object{success=bool,message=string}
// @Router       /chat/sessions/{id}/ai-message [post]
func (h *Handler) ChatSession(c *gin.Context) {
	start := time.Now()
	sessionID := c.Param("id")

	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	var req struct {
		Message  string `json:"message" binding:"required"`
		Category string `json:"category"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	const maxMessageLen = 5000
	if len([]rune(req.Message)) > maxMessageLen {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Message exceeds maximum allowed length"})
		return
	}

	resp, err := h.svc.ChatInSession(c.Request.Context(), sessionID, uid, req.Message, req.Category)
	if err != nil {
		log.Printf("[genai] ChatInSession %s: %v", sessionID, err)
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Session not found"})
		return
	}

	latencyMs := time.Since(start).Milliseconds()
	c.Header("X-AI-Latency-Ms", fmt.Sprintf("%d", latencyMs))

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"data":       resp,
		"latency_ms": latencyMs,
	})
}

// ─── POST /api/chat/sessions/:id/finalize ────────────────────────────────────

// FinalizeSession generates a final health report for the session.
//
// @Summary      Finalize chat session
// @Description  Generates a physician-review diagnosis, saves a report, and marks the session as completed.
// @Tags         chat-sessions
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Session ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /chat/sessions/{id}/finalize [post]
func (h *Handler) FinalizeSession(c *gin.Context) {
	sessionID := c.Param("id")

	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	result, err := h.svc.FinalizeSession(c.Request.Context(), sessionID, uid)
	if err != nil {
		log.Printf("[genai] FinalizeSession %s: %v", sessionID, err)
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// ─── GET /api/physicians/available ───────────────────────────────────────────

// GetAvailablePhysicians returns the list of MDCN-verified, active physicians
// for display as preview cards in the patient-facing chat UI (clinical mode only).
//
// @Summary      List available physicians
// @Description  Returns verified, active physicians for the patient to browse before connecting.
// @Tags         genai
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physicians/available [get]
func (h *Handler) GetAvailablePhysicians(c *gin.Context) {
	physicians, err := h.svc.GetAvailablePhysicians(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch physicians"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": physicians})
}

// ─── POST /api/genai/transcribe ───────────────────────────────────────────────

// Transcribe accepts a multipart audio upload (field name: "audio"), forwards
// it to OpenAI Whisper, and returns the extracted text. The audio data is
// processed entirely in memory and is never persisted on the server.
//
// @Summary      Transcribe voice to text
// @Description  Transcribes a voice recording using OpenAI Whisper. Accepts multipart/form-data with an "audio" field.
// @Tags         genai
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        audio  formData  file  true  "Audio file (webm, m4a, mp3, wav, etc)"
// @Success      200    {object}  object{success=bool,text=string}
// @Failure      400    {object}  object{success=bool,message=string}
// @Failure      500    {object}  object{success=bool,message=string}
// @Router       /genai/transcribe [post]
func (h *Handler) Transcribe(c *gin.Context) {
	const maxUploadBytes = 25 << 20 // 25 MB — Whisper hard limit
	if err := c.Request.ParseMultipartForm(maxUploadBytes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid multipart form"})
		return
	}

	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Missing audio field"})
		return
	}
	defer file.Close()

	audioData, err := io.ReadAll(io.LimitReader(file, maxUploadBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to read audio"})
		return
	}
	if len(audioData) < 512 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Audio file is too small"})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "audio/m4a"
	}

	text, err := h.svc.TranscribeAudio(c.Request.Context(), audioData, header.Filename, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": fmt.Sprintf("Transcription failed: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "text": text})
}

// ─── POST /api/genai/scan ─────────────────────────────────────────────────

// ScanImage accepts a JSON body containing a base64-encoded medical document
// image, runs it through OpenAI Vision (gpt-4o) for OCR, validates that the
// content is medically relevant, and returns the extracted text.
// The image is processed entirely in memory and is never persisted.
//
// @Summary      OCR scan of a medical document image
// @Description  Performs real-time OCR on a medical image using OpenAI Vision. Rejects non-medical images. Image is never stored.
// @Tags         genai
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  object{image=string,mimeType=string}  true  "Base64 image + MIME type"
// @Success      200   {object}  object{success=bool,text=string,isMedical=bool}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /genai/scan [post]
func (h *Handler) ScanImage(c *gin.Context) {
	var req struct {
		Image    string `json:"image" binding:"required"`
		MimeType string `json:"mimeType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.MimeType == "" {
		req.MimeType = "image/jpeg"
	}
	// ~10 MB raw → ~13.3 MB base64 limit
	if len(req.Image) > 14_000_000 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Image too large (max ~10 MB)"})
		return
	}
	if len(req.Image) < 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Image data too small"})
		return
	}

	// Enforce daily scan limit for non-Premium users.
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)
	if uid != "" {
		allowed, limitErr := h.svc.CheckAndIncrementScanUsage(uid)
		if limitErr != nil {
			log.Printf("genai: scan limit check failed (user=%s): %v", uid, limitErr)
		} else if !allowed {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "Daily scan limit reached. Free users can scan up to 5 documents per day. Upgrade to Premium for unlimited scans.",
				"code":    "SCAN_LIMIT_EXCEEDED",
			})
			return
		}
	}

	text, isMedical, err := h.svc.ScanMedicalImage(c.Request.Context(), req.Image, req.MimeType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": fmt.Sprintf("Image scan failed: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "text": text, "isMedical": isMedical})
}
