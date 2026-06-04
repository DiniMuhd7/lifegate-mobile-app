package demography

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes the demographic burden and follow-up endpoints.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// GetBurden handles GET /api/public/demographics/burden?weeks=12
func (h *Handler) GetBurden(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 12, 4, 104)
	resp, err := h.repo.GetBurden(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetFollowUp handles GET /api/public/demographics/followup?weeks=12
func (h *Handler) GetFollowUp(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 12, 4, 104)
	resp, err := h.repo.GetFollowUpStats(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func parseIntParam(c *gin.Context, name string, def, min, max int) int {
	raw := c.Query(name)
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < min || v > max {
		return def
	}
	return v
}
