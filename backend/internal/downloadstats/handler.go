package downloadstats

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler serves public download-stats endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates a handler for download stats APIs.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Get handles GET /api/download-stats.
func (h *Handler) Get(c *gin.Context) {
	stats, err := h.svc.GetStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to load download stats"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}

// Track handles POST /api/download-stats/events.
func (h *Handler) Track(c *gin.Context) {
	var req TrackEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request body"})
		return
	}

	stats, err := h.svc.TrackEvent(c.Request.Context(), req.Event)
	if err != nil {
		if err.Error() == "invalid event type" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "event must be one of: view, android_download, ios_download"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to record event"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "event recorded", "data": stats})
}
