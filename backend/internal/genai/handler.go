package genai

import (
	"fmt"
	"net/http"
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
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to process request"})
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
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
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
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

