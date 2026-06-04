package pubinsights

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes the telemedicine and compliance public endpoints.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// GetTelemedicine handles GET /api/public/telemedicine?weeks=12
func (h *Handler) GetTelemedicine(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 12, 4, 104)

	stats, err := h.repo.GetTeleStats(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GetCompliance handles GET /api/public/compliance
func (h *Handler) GetCompliance(c *gin.Context) {
	summary, err := h.repo.GetComplianceSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, summary)
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
