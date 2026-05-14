package healthaccess

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler serves the public health-access analytics endpoints.
type Handler struct {
	repo *Repository
}

// NewHandler creates a new Handler.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// ─── GET /api/public/health-access/summary ────────────────────────────────────

// GetSummary returns national headline access metrics.
//
// @Summary      National healthcare access summary
// @Tags         public-health-access
// @Produce      json
// @Param        weeks  query  integer  false  "Rolling window in weeks (1–52, default 12)"
// @Success      200  {object}  object{success=bool,data=SummaryMetrics}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/health-access/summary [get]
func (h *Handler) GetSummary(c *gin.Context) {
	weeks, _ := strconv.Atoi(c.DefaultQuery("weeks", "12"))
	if weeks < 1 || weeks > 52 {
		weeks = 12
	}
	data, err := h.repo.GetSummary(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load access summary",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// ─── GET /api/public/health-access/by-state ───────────────────────────────────

// GetByState returns per-state healthcare access metrics ordered by access
// gap score (worst-first), enabling identification of healthcare deserts.
//
// @Summary      Per-state healthcare access metrics
// @Tags         public-health-access
// @Produce      json
// @Param        weeks  query  integer  false  "Rolling window in weeks (1–52, default 12)"
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/health-access/by-state [get]
func (h *Handler) GetByState(c *gin.Context) {
	weeks, _ := strconv.Atoi(c.DefaultQuery("weeks", "12"))
	if weeks < 1 || weeks > 52 {
		weeks = 12
	}
	data, err := h.repo.GetByState(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load state access metrics",
		})
		return
	}
	if data == nil {
		data = []StateAccessMetric{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}
