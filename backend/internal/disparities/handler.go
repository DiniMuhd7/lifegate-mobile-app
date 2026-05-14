package disparities

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes the two health-disparity endpoints.
type Handler struct{ repo *Repository }

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// GetSymptomBurden handles GET /api/public/disparities/symptom-burden?weeks=26
func (h *Handler) GetSymptomBurden(c *gin.Context) {
	weeks := parseWeeks(c, 26)
	resp, err := h.repo.GetSymptomBurden(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetResponseTimeInequality handles GET /api/public/disparities/response-times?weeks=26
func (h *Handler) GetResponseTimeInequality(c *gin.Context) {
	weeks := parseWeeks(c, 26)
	resp, err := h.repo.GetResponseTimeInequality(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func parseWeeks(c *gin.Context, def int) int {
	raw := c.Query("weeks")
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 4 || v > 104 {
		return def
	}
	return v
}
