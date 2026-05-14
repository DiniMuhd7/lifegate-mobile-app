package surveillance

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler serves the public surveillance analytics endpoints.
// All responses contain only anonymised, state-level aggregate data.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// PublicCORS returns a Gin middleware that allows cross-origin requests from
// any origin.  Used exclusively on the /api/public/* group so the
// public.dshub.com.ng dashboard can call the API without credentials.
func PublicCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Accept, Content-Type")
		c.Header("Cache-Control", "public, max-age=300") // 5-minute CDN cache
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// ─── GET /api/public/surveillance/summary ─────────────────────────────────────

// GetSummary returns headline population health statistics.
//
// @Summary      Public health surveillance summary
// @Tags         public-surveillance
// @Produce      json
// @Success      200  {object}  object{success=bool,data=SummaryStats}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/surveillance/summary [get]
func (h *Handler) GetSummary(c *gin.Context) {
	stats, err := h.svc.GetSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load summary",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}

// ─── GET /api/public/surveillance/trends ──────────────────────────────────────

// GetTrends returns weekly condition frequency trend series.
//
// @Summary      Condition frequency trends (weekly)
// @Tags         public-surveillance
// @Produce      json
// @Param        weeks  query  integer  false  "Number of weeks to include (1–52, default 12)"
// @Param        limit  query  integer  false  "Max conditions to return (1–20, default 10)"
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/surveillance/trends [get]
func (h *Handler) GetTrends(c *gin.Context) {
	weeks, _ := strconv.Atoi(c.DefaultQuery("weeks", "12"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	trends, err := h.svc.GetTopConditions(weeks, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load trends",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": trends})
}

// ─── GET /api/public/surveillance/by-state ────────────────────────────────────

// GetByState returns per-state condition case counts for the regional heatmap.
//
// @Summary      Condition case counts by state
// @Tags         public-surveillance
// @Produce      json
// @Param        weeks  query  integer  false  "Rolling window in weeks (1–52, default 12)"
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/surveillance/by-state [get]
func (h *Handler) GetByState(c *gin.Context) {
	weeks, _ := strconv.Atoi(c.DefaultQuery("weeks", "12"))

	data, err := h.svc.GetByState(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load state breakdown",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// ─── GET /api/public/surveillance/seasonal ────────────────────────────────────

// GetSeasonal returns monthly condition case counts to reveal seasonal patterns.
//
// @Summary      Seasonal illness trend patterns (monthly)
// @Tags         public-surveillance
// @Produce      json
// @Param        weeksBack  query  integer  false  "Rolling window in weeks (4–104, default 52)"
// @Param        topN       query  integer  false  "Number of top conditions (1–15, default 8)"
// @Success      200  {object}  object{success=bool,data=SeasonalResponse}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/surveillance/seasonal [get]
func (h *Handler) GetSeasonal(c *gin.Context) {
	weeksBack, _ := strconv.Atoi(c.DefaultQuery("weeksBack", "52"))
	topN, _ := strconv.Atoi(c.DefaultQuery("topN", "8"))

	data, err := h.svc.GetSeasonalPatterns(weeksBack, topN)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load seasonal patterns",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// ─── GET /api/public/surveillance/anomalies ───────────────────────────────────

// GetAnomalies returns currently active outbreak anomaly signals.
//
// @Summary      Active outbreak anomaly signals
// @Tags         public-surveillance
// @Produce      json
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /public/surveillance/anomalies [get]
func (h *Handler) GetAnomalies(c *gin.Context) {
	anomalies, err := h.svc.GetActiveAnomalies()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false, "message": "Failed to load anomalies",
		})
		return
	}
	if anomalies == nil {
		anomalies = []Anomaly{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": anomalies})
}
