package healthmetrics

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler handles health-metrics HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler returns a Handler backed by svc.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Sync handles POST /api/health-metrics/sync.
//
// @Summary      Upload an activity snapshot
// @Description  The mobile client calls this endpoint periodically (foreground
//               every 5 minutes; background-fetch every ~15 minutes) to persist
//               the patient's step count, active minutes, distance, and calories
//               for the current day.
// @Tags         health-metrics
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body SyncRequest true "Activity snapshot"
// @Success      200 {object} map[string]interface{}
// @Router       /health-metrics/sync [post]
func (h *Handler) Sync(c *gin.Context) {
	var req SyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request body"})
		return
	}

	uid, _ := c.Get("userID")
	userID, _ := uid.(string)

	if err := h.svc.Sync(c.Request.Context(), userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to save metrics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "metrics recorded"})
}

// Today handles GET /api/health-metrics/today.
//
// @Summary      Get today's activity summary
// @Description  Returns the latest health-metric snapshot recorded for the
//               authenticated patient on the current UTC calendar day.
// @Tags         health-metrics
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} TodaySummary
// @Router       /health-metrics/today [get]
func (h *Handler) Today(c *gin.Context) {
	uid, _ := c.Get("userID")
	userID, _ := uid.(string)

	summary, err := h.svc.Today(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to fetch metrics"})
		return
	}

	c.JSON(http.StatusOK, summary)
}
