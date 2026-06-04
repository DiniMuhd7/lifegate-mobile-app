package research

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes the three research analytics endpoints.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// GetLongitudinal handles GET /api/public/research/longitudinal?weeks=52
func (h *Handler) GetLongitudinal(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 52, 4, 104)
	resp, err := h.repo.GetLongitudinal(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetAIBenchmark handles GET /api/public/research/ai-benchmark?weeks=52
func (h *Handler) GetAIBenchmark(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 52, 4, 104)
	resp, err := h.repo.GetAIBenchmark(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetComorbidity handles GET /api/public/research/comorbidity?weeks=52&topN=15
func (h *Handler) GetComorbidity(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 52, 4, 104)
	topN := parseIntParam(c, "topN", 15, 1, 30)
	resp, err := h.repo.GetComorbidity(weeks, topN)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetAgreementPatterns handles GET /api/public/research/agreement?weeks=52
func (h *Handler) GetAgreementPatterns(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 52, 4, 104)
	resp, err := h.repo.GetAgreementPatterns(weeks)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GetEscalationAnalysis handles GET /api/public/research/escalation?weeks=52
func (h *Handler) GetEscalationAnalysis(c *gin.Context) {
	weeks := parseIntParam(c, "weeks", 52, 4, 104)
	resp, err := h.repo.GetEscalationAnalysis(weeks)
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
