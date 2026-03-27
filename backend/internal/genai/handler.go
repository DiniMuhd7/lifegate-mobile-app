package genai

import (
"net/http"

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
var req struct {
Message          string           `json:"message" binding:"required"`
PreviousMessages []ai.ChatMessage `json:"previousMessages"`
}
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
return
}

userID, _ := c.Get("userID")
uid, _ := userID.(string)

resp, err := h.svc.Chat(c.Request.Context(), ChatRequest{
Message:          req.Message,
PreviousMessages: req.PreviousMessages,
UserID:           uid,
})
if err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "AI provider error: " + err.Error()})
return
}

c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}
