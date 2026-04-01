package physician

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) GetReports(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	reports, total, err := h.svc.GetReports(pid, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Reports fetched",
		"data": gin.H{
			"reports":  reports,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func (h *Handler) GetStats(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	stats, err := h.svc.GetStats(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stats fetched", "data": stats})
}

// ReviewReport handles POST /physician/reports/:id/review.
// Accepts: { action, notes, physician_decision, rejection_reason }
func (h *Handler) ReviewReport(c *gin.Context) {
	reportID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var req struct {
		Action            string `json:"action"             binding:"required"`
		Notes             string `json:"notes"`
		PhysicianDecision string `json:"physician_decision"`
		RejectionReason   string `json:"rejection_reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Validate: rejection reason is required when decision is Rejected.
	if req.PhysicianDecision == "Rejected" && req.RejectionReason == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "rejection_reason is required when physician_decision is Rejected",
		})
		return
	}

	input := ReviewInput{
		Action:            req.Action,
		Notes:             req.Notes,
		PhysicianDecision: req.PhysicianDecision,
		RejectionReason:   req.RejectionReason,
	}

	if err := h.svc.ReviewReport(reportID, pid, input); err != nil {
		if errors.Is(err, ErrCaseNotPending) || errors.Is(err, ErrCaseNotActive) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Review submitted"})
}

// GetCaseQueue handles GET /physician/cases — returns the three-bucket queue.
func (h *Handler) GetCaseQueue(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	result, err := h.svc.GetCaseQueue(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Case queue fetched", "data": result})
}

// TakeCase handles POST /physician/cases/:id/take — atomically claims a Pending
// case and transitions it to Active, locking it to the requesting physician.
func (h *Handler) TakeCase(c *gin.Context) {
	caseID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	if err := h.svc.TakeCase(caseID, pid); err != nil {
		if errors.Is(err, ErrCaseNotPending) {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "Case is no longer available — another physician may have taken it.",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Case accepted"})
}

// GetCaseDetail handles GET /physician/cases/:id — returns the full case record
// including parsed AI output, for the physician review screen.
func (h *Handler) GetCaseDetail(c *gin.Context) {
	caseID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	detail, err := h.svc.GetCaseDetail(caseID, pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Case not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Case detail fetched", "data": detail})
}

// GetPatientProfile handles GET /physician/patients/:id — returns the patient's
// health profile for inline display during the case review.
func (h *Handler) GetPatientProfile(c *gin.Context) {
	patientID := c.Param("id")

	profile, err := h.svc.GetPatientProfile(patientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if profile == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Patient not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Patient profile fetched", "data": profile})
}

// GetEarningsSummary handles GET /physician/earnings — returns the aggregated
// earnings dashboard: total earned, pending payout, case counts, next payout date.
func (h *Handler) GetEarningsSummary(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	summary, err := h.svc.GetEarningsSummary(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Earnings summary fetched", "data": summary})
}

// GetEarningsHistory handles GET /physician/earnings/history — returns paginated
// per-case earning records with patient, condition, and payout status.
func (h *Handler) GetEarningsHistory(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	records, total, err := h.svc.GetEarningsHistory(pid, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Earnings history fetched",
		"data": gin.H{
			"records":  records,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetPayouts handles GET /physician/payouts — returns all payout records.
func (h *Handler) GetPayouts(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	payouts, err := h.svc.GetPayouts(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payouts fetched", "data": payouts})
}

// UpdateAIOutput handles PATCH /physician/cases/:id/ai — lets a physician edit
// the AI-generated condition, urgency, and confidence score inline.
func (h *Handler) UpdateAIOutput(c *gin.Context) {
	caseID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var req struct {
		Condition  string `json:"condition"  binding:"required"`
		Urgency    string `json:"urgency"    binding:"required"`
		Confidence int    `json:"confidence"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.Confidence < 0 || req.Confidence > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "confidence must be 0–100"})
		return
	}

	if err := h.svc.UpdateAIOutput(caseID, pid, req.Condition, req.Urgency, req.Confidence); err != nil {
		if errors.Is(err, ErrCaseNotActive) {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "Case must be Active and owned by you to edit AI output",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "AI output updated"})
}

