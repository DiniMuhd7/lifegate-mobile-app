package support

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ContactSupport(c *gin.Context) {
	var req struct {
		ContactName  string `json:"contactName"`
		ContactEmail string `json:"contactEmail" binding:"required,email"`
		LifeGateID   string `json:"lifeGateId"`
		IssueType    string `json:"issueType" binding:"required"`
		Description  string `json:"description" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	role, _ := c.Get("role")
	userID, _ := c.Get("userID")
	defaultEmail, _ := c.Get("email")
	contactEmail := req.ContactEmail
	if contactEmail == "" {
		if email, ok := defaultEmail.(string); ok {
			contactEmail = email
		}
	}

	refID, err := h.svc.SubmitContactRequest(c.Request.Context(), ContactRequest{
		ContactName:  req.ContactName,
		ContactEmail: contactEmail,
		Role:         asString(role),
		UserID:       asString(userID),
		LifeGateID:   req.LifeGateID,
		IssueType:    req.IssueType,
		Description:  req.Description,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Support request sent successfully",
		"data":    gin.H{"referenceId": refID},
	})
}

func asString(value interface{}) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}
