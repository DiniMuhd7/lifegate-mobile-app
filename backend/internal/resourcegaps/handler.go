package resourcegaps

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes the resource gap endpoints.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// GetGaps handles GET /api/public/resource-gaps
// Query params:
//   - weeks  int  4-104  (default 12)
//   - limit  int  1-50   (default 30)
func (h *Handler) GetGaps(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 12, 4, 104)
	limit := parseIntParam(c, "limit", 30, 1, 50)

	resp, err := h.repo.GetGaps(weeks, limit)
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
