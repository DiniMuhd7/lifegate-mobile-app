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
c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "AI provider error: " + err.Error()})
return
}

latencyMs := time.Since(start).Milliseconds()

// Expose latency in response header for client-side observability.
c.Header("X-AI-Latency-Ms", fmt.Sprintf("%d", latencyMs))

c.JSON(http.StatusOK, gin.H{
	"success":     true,
	"data":        resp.AIResponse,
	"escalated":   resp.Escalated,
	"diagnosisId": resp.DiagnosisID,
	"latency_ms":  latencyMs,
})
}
