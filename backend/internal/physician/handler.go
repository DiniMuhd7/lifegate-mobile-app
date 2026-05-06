package physician

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	auditpkg "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/audit"
	ai "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// GetReports returns paginated physician reports.
//
// @Summary      List physician reports
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page number (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 10, max 100)"
// @Success      200  {object}  object{success=bool,data=object{reports=array,total=integer,page=integer,pageSize=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/reports [get]
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

// GetStats returns the physician's activity statistics.
//
// @Summary      Physician statistics
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/stats [get]
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

// ReviewReport submits a physician review decision on a report.
//
// @Summary      Submit report review
// @Description  Action values: "approve", "reject", "escalate". When physician_decision is Rejected, rejection_reason is required.
// @Tags         physician
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string  true  "Report ID"
// @Param        body  body      object{action=string,notes=string,physician_decision=string,rejection_reason=string}  true  "Review payload"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      409   {object}  object{success=bool,message=string}
// @Router       /physician/reports/{id}/review [post]
func (h *Handler) ReviewReport(c *gin.Context) {
	reportID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var req struct {
		Action                string              `json:"action"              binding:"required"`
		Notes                 string              `json:"notes"`
		PhysicianDecision     string              `json:"physician_decision"`
		RejectionReason       string              `json:"rejection_reason"`
		UpdatedPrescription   *ai.Prescription    `json:"updated_prescription"`
		UpdatedInvestigations []ai.Investigation  `json:"updated_investigations"`
		UpdatedConditions     []ai.ConditionScore `json:"updated_conditions"`
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
		Action:                req.Action,
		Notes:                 req.Notes,
		PhysicianDecision:     req.PhysicianDecision,
		RejectionReason:       req.RejectionReason,
		UpdatedPrescription:   req.UpdatedPrescription,
		UpdatedInvestigations: req.UpdatedInvestigations,
		UpdatedConditions:     req.UpdatedConditions,
	}

	if err := h.svc.ReviewReport(reportID, pid, input); err != nil {
		if errors.Is(err, ErrCaseNotPending) || errors.Is(err, ErrCaseNotActive) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Audit: log the review/escalation event.
	eventType := "case.reviewed"
	if req.Action == "escalate" {
		eventType = "case.escalated"
	}
	auditpkg.Log(c.Request.Context(), pid, "physician", eventType, "diagnosis", reportID,
		map[string]interface{}{"status": "Active"},
		map[string]interface{}{"action": req.Action, "decision": req.PhysicianDecision},
		nil,
		c.ClientIP(),
	)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Review submitted"})
}

// GetCaseQueue returns the three-bucket case queue for the physician.
//
// @Summary      Physician case queue
// @Description  Returns pending, active, and completed case buckets for the requesting physician.
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/cases [get]
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

// TakeCase atomically claims a pending case for the requesting physician.
//
// @Summary      Take/claim a case
// @Description  Transitions the case from Pending to Active and assigns it to the requesting physician.
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Case (diagnosis) ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      409  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/cases/{id}/take [post]
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

	// Audit: case claimed and moved to Active.
	auditpkg.Log(c.Request.Context(), pid, "physician", "case.status_change", "diagnosis", caseID,
		map[string]interface{}{"status": "Pending"},
		map[string]interface{}{"status": "Active", "physician_id": pid},
		nil,
		c.ClientIP(),
	)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Case accepted"})
}

// GetCaseDetail returns the full case details for the physician review screen.
//
// @Summary      Get case detail
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Case (diagnosis) ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/cases/{id} [get]
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

// GetPatientProfile returns a patient's health profile for use during case review.
//
// @Summary      Get patient profile
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Patient ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/patients/{id} [get]
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

// GetEarningsSummary returns the physician's aggregated earnings dashboard.
//
// @Summary      Earnings summary
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/earnings [get]
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

// GetEarningsHistory returns paginated per-case earning records.
//
// @Summary      Earnings history
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 20, max 100)"
// @Success      200   {object}  object{success=bool,data=object{records=array,total=integer,page=integer,pageSize=integer}}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /physician/earnings/history [get]
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

// GetPayouts returns all payout records for the physician.
//
// @Summary      Physician payouts
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /physician/payouts [get]
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

// RequestPayout lets a physician request a payout of their pending earnings.
//
// @Summary      Request payout
// @Tags         physician
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      400  {object}  object{success=bool,message=string}
// @Failure      409  {object}  object{success=bool,message=string}
// @Router       /physician/payouts/request [post]
func (h *Handler) RequestPayout(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	payout, err := h.svc.RequestPayout(pid)
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "no pending earnings to request a payout for" ||
			err.Error() == "a payout request for this month is already pending review" {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payout request submitted", "data": payout})
}

// AdminListPayoutRequests returns all physician payout requests for admin review.
//
// @Summary      List physician payout requests
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "Filter by status (requested|processing|paid|rejected)"
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/physician-payouts [get]
func (h *Handler) AdminListPayoutRequests(c *gin.Context) {
	status := c.Query("status")
	items, err := h.svc.GetAdminPayoutRequests(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "total": len(items)})
}

// AdminApprovePayoutRequest approves a physician payout request.
//
// @Summary      Approve physician payout
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Payout ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      400  {object}  object{success=bool,message=string}
// @Router       /admin/physician-payouts/:id/approve [post]
func (h *Handler) AdminApprovePayoutRequest(c *gin.Context) {
	payoutID := c.Param("id")
	adminID, _ := c.Get("userID")
	aid, _ := adminID.(string)

	if err := h.svc.ApprovePayoutRequest(payoutID, aid); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payout request approved"})
}

// AdminRejectPayoutRequest rejects a physician payout request.
//
// @Summary      Reject physician payout
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Payout ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      400  {object}  object{success=bool,message=string}
// @Router       /admin/physician-payouts/:id/reject [post]
func (h *Handler) AdminRejectPayoutRequest(c *gin.Context) {
	payoutID := c.Param("id")
	adminID, _ := c.Get("userID")
	aid, _ := adminID.(string)

	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)

	if err := h.svc.RejectPayoutRequest(payoutID, aid, req.Reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payout request rejected"})
}

// UpdateAIOutput lets a physician edit the AI-generated diagnosis inline.
//
// @Summary      Update AI output
// @Description  Allows the owning physician to correct the AI condition, urgency, confidence score,
// @Description  add clinical notes, recommend medication, and recommend tests/investigations.
// @Tags         physician
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string  true  "Case (diagnosis) ID"
// @Param        body  body      object  true  "Updated AI output"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      409   {object}  object{success=bool,message=string}
// @Router       /physician/cases/{id}/ai [patch]
func (h *Handler) UpdateAIOutput(c *gin.Context) {
	caseID := c.Param("id")
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var req struct {
		Condition      string               `json:"condition"    binding:"required"`
		Urgency        string               `json:"urgency"      binding:"required"`
		Confidence     int                  `json:"confidence"`
		Notes          string               `json:"notes"`
		HealthTips     string               `json:"healthTips"`
		Prescription   *PrescriptionOutput  `json:"prescription"`
		Prescriptions  []PrescriptionOutput `json:"prescriptions"`
		Investigations []ai.Investigation   `json:"investigations"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.Confidence < 0 || req.Confidence > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "confidence must be 0–100"})
		return
	}

	// Build physician AI output if any recommendations were provided.
	var physOut *PhysicianAIOutput
	if req.Prescription != nil && req.Prescription.Medicine != "" || len(req.Prescriptions) > 0 || len(req.Investigations) > 0 {
		var prescOut *ai.Prescription
		var prescsOut []ai.Prescription

		// Use the explicit prescriptions array when provided; fall back to the
		// legacy single-prescription field for older clients.
		if len(req.Prescriptions) > 0 {
			for _, p := range req.Prescriptions {
				if strings.TrimSpace(p.Medicine) == "" {
					continue
				}
				prescsOut = append(prescsOut, ai.Prescription{
					Medicine:     strings.TrimSpace(p.Medicine),
					Dosage:       strings.TrimSpace(p.Dosage),
					Frequency:    strings.TrimSpace(p.Frequency),
					Duration:     strings.TrimSpace(p.Duration),
					Instructions: strings.TrimSpace(p.Instructions),
				})
			}
			// Keep the singular field as the first entry for backward compat.
			if len(prescsOut) > 0 {
				prescOut = &prescsOut[0]
			}
		} else if req.Prescription != nil && req.Prescription.Medicine != "" {
			prescOut = &ai.Prescription{
				Medicine:     strings.TrimSpace(req.Prescription.Medicine),
				Dosage:       strings.TrimSpace(req.Prescription.Dosage),
				Frequency:    strings.TrimSpace(req.Prescription.Frequency),
				Duration:     strings.TrimSpace(req.Prescription.Duration),
				Instructions: strings.TrimSpace(req.Prescription.Instructions),
			}
		}
		physOut = &PhysicianAIOutput{
			Prescription:   prescOut,
			Prescriptions:  prescsOut,
			Investigations: req.Investigations,
		}
	}

	if err := h.svc.UpdateAIOutput(caseID, pid, req.Condition, req.Urgency, req.Confidence, req.Notes, strings.TrimSpace(req.HealthTips), physOut); err != nil {
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

// UpdateProfile lets a physician update their name and phone number.
//
// @Summary      Update physician profile
// @Tags         physician
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{name=string,phone=string}  true  "Profile fields"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /physician/profile [patch]
func (h *Handler) UpdateProfile(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var req struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	if req.Name == "" && req.Phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "at least one of name or phone is required"})
		return
	}
	if err := h.svc.UpdateProfile(pid, req.Name, req.Phone); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Profile updated"})
}
