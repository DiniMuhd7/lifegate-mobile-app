package institutional

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/middleware"
)

// Handler wires the institutional analytics HTTP endpoints.
type Handler struct {
	repo *Repository
}

// NewHandler returns a Handler backed by the given Repository.
func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// ─── helpers ─────────────────────────────────────────────────────────────────

// weeksParam parses the `weeks` query-string parameter (default 52, max 104).
func weeksParam(c *gin.Context) int {
	if raw := c.Query("weeks"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			if v > 104 {
				v = 104
			}
			return v
		}
	}
	return 52
}

// hasExportAccess returns true when the caller's tier permits bulk downloads.
func hasExportAccess(c *gin.Context) bool {
	tier := c.GetString(middleware.CtxKeyInstitutionalTier)
	return tier == "export" || tier == "api"
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GetSurveillanceTrends godoc
//
//	@Summary     Weekly surveillance trends
//	@Description Returns weekly case counts by condition, Nigerian state and gender.
//	@Tags        institutional
//	@Produce     json
//	@Param       weeks  query  int  false  "Lookback window in weeks (default 52, max 104)"
//	@Security    APIKey
//	@Success     200  {object}  map[string]interface{}
//	@Router      /institutional/surveillance/trends [get]
func (h *Handler) GetSurveillanceTrends(c *gin.Context) {
	weeks := weeksParam(c)
	data, err := h.repo.GetSurveillanceTrends(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"weeks":   weeks,
		"total":   len(data),
		"data":    data,
	})
}

// GetDemographics godoc
//
//	@Summary     Deep demographics breakdown
//	@Description Case counts cross-tabulated by condition, age group, gender, blood type and genotype.
//	@Tags        institutional
//	@Produce     json
//	@Param       weeks  query  int  false  "Lookback window in weeks (default 52, max 104)"
//	@Security    APIKey
//	@Success     200  {object}  map[string]interface{}
//	@Router      /institutional/demographics [get]
func (h *Handler) GetDemographics(c *gin.Context) {
	weeks := weeksParam(c)
	data, err := h.repo.GetDemographicsBreakdown(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"weeks":   weeks,
		"total":   len(data),
		"data":    data,
	})
}

// GetOutcomes godoc
//
//	@Summary     Deep care-pathway outcomes
//	@Description Physician decisions, prescriptions, follow-up completion and AI confidence per condition×state.
//	@Tags        institutional
//	@Produce     json
//	@Param       weeks  query  int  false  "Lookback window in weeks (default 52, max 104)"
//	@Security    APIKey
//	@Success     200  {object}  map[string]interface{}
//	@Router      /institutional/outcomes [get]
func (h *Handler) GetOutcomes(c *gin.Context) {
	weeks := weeksParam(c)
	data, err := h.repo.GetOutcomesDeep(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"weeks":   weeks,
		"total":   len(data),
		"data":    data,
	})
}

// GetDisparities godoc
//
//	@Summary     Full state-level health disparities matrix
//	@Description All 37 Nigerian states with urgency distribution, escalation rates, and top conditions.
//	@Tags        institutional
//	@Produce     json
//	@Param       weeks  query  int  false  "Lookback window in weeks (default 52, max 104)"
//	@Security    APIKey
//	@Success     200  {object}  map[string]interface{}
//	@Router      /institutional/disparities [get]
func (h *Handler) GetDisparities(c *gin.Context) {
	weeks := weeksParam(c)
	data, err := h.repo.GetDisparitiesDeep(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"weeks":   weeks,
		"total":   len(data),
		"data":    data,
	})
}

// Export godoc
//
//	@Summary     Bulk export
//	@Description Downloads a full dataset as CSV or JSON. Requires the "export" or "api" tier.
//	@Tags        institutional
//	@Produce     text/csv,application/json
//	@Param       dataset  query  string  true   "One of: surveillance, demographics, outcomes, disparities"
//	@Param       format   query  string  false  "csv (default) or json"
//	@Param       weeks    query  int     false  "Lookback window in weeks (default 52, max 104)"
//	@Security    APIKey
//	@Success     200  {string}  string  "CSV or JSON payload"
//	@Router      /institutional/export [get]
func (h *Handler) Export(c *gin.Context) {
	if !hasExportAccess(c) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "your tier does not include export access",
		})
		return
	}

	dataset := strings.ToLower(strings.TrimSpace(c.Query("dataset")))
	if !validDataset(dataset) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "dataset must be one of: surveillance, demographics, outcomes, disparities",
		})
		return
	}

	format := strings.ToLower(strings.TrimSpace(c.Query("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "json" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "format must be csv or json"})
		return
	}

	weeks := weeksParam(c)

	switch dataset {
	case "surveillance":
		h.exportSurveillance(c, weeks, format)
	case "demographics":
		h.exportDemographics(c, weeks, format)
	case "outcomes":
		h.exportOutcomes(c, weeks, format)
	case "disparities":
		h.exportDisparities(c, weeks, format)
	}
}

// ─── per-dataset export helpers ───────────────────────────────────────────────

func (h *Handler) exportSurveillance(c *gin.Context, weeks int, format string) {
	data, err := h.repo.GetSurveillanceTrends(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	if format == "json" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="surveillance_%dw.json"`, weeks))
		c.JSON(http.StatusOK, gin.H{"success": true, "weeks": weeks, "total": len(data), "data": data})
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="surveillance_%dw.csv"`, weeks))
	w := csv.NewWriter(c.Writer)
	_ = w.Write(SurveillanceTrendCSVHeaders())
	for _, row := range data {
		_ = w.Write(SurveillanceTrendCSVRow(row))
	}
	w.Flush()
}

func (h *Handler) exportDemographics(c *gin.Context, weeks int, format string) {
	data, err := h.repo.GetDemographicsBreakdown(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	if format == "json" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="demographics_%dw.json"`, weeks))
		c.JSON(http.StatusOK, gin.H{"success": true, "weeks": weeks, "total": len(data), "data": data})
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="demographics_%dw.csv"`, weeks))
	w := csv.NewWriter(c.Writer)
	_ = w.Write(DemographicsCSVHeaders())
	for _, row := range data {
		_ = w.Write(DemographicsCSVRow(row))
	}
	w.Flush()
}

func (h *Handler) exportOutcomes(c *gin.Context, weeks int, format string) {
	data, err := h.repo.GetOutcomesDeep(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	if format == "json" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="outcomes_%dw.json"`, weeks))
		c.JSON(http.StatusOK, gin.H{"success": true, "weeks": weeks, "total": len(data), "data": data})
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="outcomes_%dw.csv"`, weeks))
	w := csv.NewWriter(c.Writer)
	_ = w.Write(OutcomesCSVHeaders())
	for _, row := range data {
		_ = w.Write(OutcomesCSVRow(row))
	}
	w.Flush()
}

func (h *Handler) exportDisparities(c *gin.Context, weeks int, format string) {
	data, err := h.repo.GetDisparitiesDeep(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "query failed"})
		return
	}
	if format == "json" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="disparities_%dw.json"`, weeks))
		c.JSON(http.StatusOK, gin.H{"success": true, "weeks": weeks, "total": len(data), "data": data})
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="disparities_%dw.csv"`, weeks))
	w := csv.NewWriter(c.Writer)
	_ = w.Write(DisparitiesCSVHeaders())
	for _, row := range data {
		_ = w.Write(DisparitiesCSVRow(row))
	}
	w.Flush()
}
