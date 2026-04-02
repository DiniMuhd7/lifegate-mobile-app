package admin

import (
	"fmt"
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

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────

// GetDashboard returns the admin overview dashboard statistics.
//
// @Summary      Admin dashboard stats
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/dashboard [get]
func (h *Handler) GetDashboard(c *gin.Context) {
	stats, err := h.svc.GetDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load dashboard"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}

// ─── GET /api/admin/cases ─────────────────────────────────────────────────────

// GetCases returns a paginated, filtered list of all cases.
//
// @Summary      Admin case list
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 20)"
// @Param        status    query     string   false  "Filter by status"
// @Param        urgency   query     string   false  "Filter by urgency"
// @Param        category  query     string   false  "Filter by category"
// @Param        search    query     string   false  "Search by patient name or condition"
// @Success      200   {object}  object{success=bool,data=array,meta=object{total=integer,page=integer,pageSize=integer}}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/cases [get]
func (h *Handler) GetCases(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	f := CaseFilters{
		Status:   c.Query("status"),
		Urgency:  c.Query("urgency"),
		Category: c.Query("category"),
		Search:   c.Query("search"),
		Page:     page,
		PageSize: pageSize,
	}

	cases, total, err := h.svc.GetAllCases(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load cases"})
		return
	}
	if cases == nil {
		cases = []CaseRow{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    cases,
		"meta": gin.H{
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// ─── GET /api/admin/sla ───────────────────────────────────────────────────────

// GetSLA returns active SLA items with wait time formatting.
//
// @Summary      SLA report
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/sla [get]
func (h *Handler) GetSLA(c *gin.Context) {
	items, err := h.svc.GetSLAReport()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load SLA report"})
		return
	}
	if items == nil {
		items = []SLAItem{}
	}

	type enriched struct {
		SLAItem
		WaitFormatted string `json:"waitFormatted"`
	}
	out := make([]enriched, len(items))
	for i, item := range items {
		out[i] = enriched{SLAItem: item, WaitFormatted: FormatWait(item.SecondsWait)}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": out})
}

// ─── GET /api/admin/metrics/edis ─────────────────────────────────────────────

// GetEDISMetrics returns EDIS (AI accuracy) metrics for a time window.
//
// @Summary      EDIS metrics
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        days  query     integer  false  "Number of days to look back (default 30)"
// @Success      200   {object}  object{success=bool,data=object}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/metrics/edis [get]
func (h *Handler) GetEDISMetrics(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	metrics, err := h.svc.GetEDISMetrics(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load EDIS metrics"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": metrics})
}

// ─── GET /api/admin/physicians ───────────────────────────────────────────────

// GetPhysicians returns all physicians with status, flag, and SLA breach count.
//
// @Summary      List all physicians
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/physicians [get]
func (h *Handler) GetPhysicians(c *gin.Context) {
	physicians, err := h.svc.GetPhysicians()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load physicians"})
		return
	}
	if physicians == nil {
		physicians = []PhysicianRow{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": physicians})
}

// ─── GET /api/admin/physicians/:id ───────────────────────────────────────────

// GetPhysicianDetail returns the full admin view of a physician's profile.
//
// @Summary      Get physician detail
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Physician user ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id} [get]
func (h *Handler) GetPhysicianDetail(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.svc.GetPhysicianDetail(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Physician not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": detail})
}

// ─── POST /api/admin/physicians ──────────────────────────────────────────────

// CreatePhysician creates a new physician account.
//
// @Summary      Create physician account
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{name=string,email=string,password=string,specialization=string,phone=string}  true  "Physician data"
// @Success      201   {object}  object{success=bool,message=string,data=object{id=string}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/physicians [post]
func (h *Handler) CreatePhysician(c *gin.Context) {
	var inp CreatePhysicianInput
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if inp.Name == "" || inp.Email == "" || inp.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "name, email and password are required"})
		return
	}

	id, err := h.svc.CreatePhysician(inp)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create physician"})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "physician.create", "user", &id,
		map[string]interface{}{"email": inp.Email, "name": inp.Name})

	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "Physician account created", "data": gin.H{"id": id}})
}

// ─── PATCH /api/admin/physicians/:id ─────────────────────────────────────────

// UpdatePhysician updates mutable physician fields.
//
// @Summary      Update physician
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string  true  "Physician user ID"
// @Param        body  body      object  false  "Fields to update"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id} [patch]
func (h *Handler) UpdatePhysician(c *gin.Context) {
	id := c.Param("id")
	var inp UpdatePhysicianInput
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := h.svc.UpdatePhysician(id, inp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update physician"})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "physician.update", "user", &id, map[string]interface{}{})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Physician updated"})
}

// ─── DELETE /api/admin/physicians/:id ────────────────────────────────────────

// DeletePhysician removes a physician account.
//
// @Summary      Delete physician
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Physician user ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id} [delete]
func (h *Handler) DeletePhysician(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.DeletePhysician(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "physician.delete", "user", &id, map[string]interface{}{})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Physician account deleted"})
}

// ─── POST /api/admin/physicians/:id/suspend ──────────────────────────────────

// SuspendPhysician suspends a physician account.
//
// @Summary      Suspend physician
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                    true   "Physician user ID"
// @Param        body  body      object{reason=string}     false  "Suspension reason"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      404   {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id}/suspend [post]
func (h *Handler) SuspendPhysician(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	if err := h.svc.SuspendPhysician(id, adminIDStr, body.Reason); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Physician account suspended"})
}

// ─── POST /api/admin/physicians/:id/unsuspend ────────────────────────────────

// UnsuspendPhysician restores a suspended physician account.
//
// @Summary      Unsuspend physician
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Physician user ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id}/unsuspend [post]
func (h *Handler) UnsuspendPhysician(c *gin.Context) {
	id := c.Param("id")
	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	if err := h.svc.UnsuspendPhysician(id, adminIDStr); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Physician account reinstated"})
}

// ─── POST /api/admin/physicians/:id/mdcn-override ────────────────────────────

// OverrideMDCN lets an admin confirm or reject a physician's MDCN verification.
//
// @Summary      Override MDCN verification
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                              true  "Physician user ID"
// @Param        body  body      object{status=string}               true  "Status: confirmed | rejected"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      404   {object}  object{success=bool,message=string}
// @Router       /admin/physicians/{id}/mdcn-override [post]
func (h *Handler) OverrideMDCN(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "status is required (confirmed | rejected)"})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	if err := h.svc.OverrideMDCN(id, adminIDStr, body.Status); err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "physician not found" {
			status = http.StatusNotFound
		} else if err.Error()[:7] == "invalid" {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "MDCN verification override applied"})
}

// ─── POST /api/admin/physicians/flag-check ───────────────────────────────────

// TriggerFlagCheck manually runs the SLA breach flag check across all physicians.
//
// @Summary      Trigger SLA flag check
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object{newlyFlagged=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/physicians/flag-check [post]
func (h *Handler) TriggerFlagCheck(c *gin.Context) {
	count, err := h.svc.CheckAndFlagPhysicians()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Flag check failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"newlyFlagged": count}})
}

// ─── GET /api/admin/sla/breach-alerts ────────────────────────────────────────

// GetSLABreachAlerts returns recent SLA breach events for the admin alert panel.
//
// @Summary      SLA breach alerts
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        limit  query     integer  false  "Max results (default 50, max 100)"
// @Success      200    {object}  object{success=bool,data=array}
// @Failure      500    {object}  object{success=bool,message=string}
// @Router       /admin/sla/breach-alerts [get]
func (h *Handler) GetSLABreachAlerts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	alerts, err := h.svc.GetSLABreachAlerts(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load breach alerts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": alerts})
}

// ─── GET /api/admin/sla/reassignment-log ─────────────────────────────────────

// GetReassignmentLog returns a paginated list of auto-reassignment events.
//
// @Summary      SLA reassignment log
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 20)"
// @Success      200   {object}  object{success=bool,data=array,meta=object{total=integer,page=integer,pageSize=integer}}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/sla/reassignment-log [get]
func (h *Handler) GetReassignmentLog(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	entries, total, err := h.svc.GetReassignmentLog(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load reassignment log"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    entries,
		"meta": gin.H{
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// ─── GET /api/admin/audit ─────────────────────────────────────────────────────

// GetAuditLog returns a filtered, paginated audit event list.
//
// @Summary      Audit log
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        eventType  query     string   false  "Filter by event type"
// @Param        actorRole  query     string   false  "Filter by actor role"
// @Param        resource   query     string   false  "Filter by resource type"
// @Param        dateFrom   query     string   false  "Start date (YYYY-MM-DD)"
// @Param        dateTo     query     string   false  "End date (YYYY-MM-DD)"
// @Param        page       query     integer  false  "Page (default 1)"
// @Param        pageSize   query     integer  false  "Items per page (default 50)"
// @Success      200   {object}  object{success=bool,data=array,meta=object}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/audit [get]
func (h *Handler) GetAuditLog(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))

	f := AuditFilters{
		EventType: c.Query("eventType"),
		ActorRole: c.Query("actorRole"),
		Resource:  c.Query("resource"),
		DateFrom:  c.Query("dateFrom"),
		DateTo:    c.Query("dateTo"),
		Page:      page,
		PageSize:  pageSize,
	}

	events, total, err := h.svc.GetAuditEvents(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load audit log"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    events,
		"meta":    gin.H{"total": total, "page": page, "pageSize": pageSize},
	})
}

// ─── GET /api/admin/audit/export ─────────────────────────────────────────────

// ExportAuditCSV streams a CSV download of filtered audit events.
//
// @Summary      Export audit log CSV
// @Tags         admin
// @Produce      text/csv
// @Security     BearerAuth
// @Param        eventType  query     string  false  "Filter by event type"
// @Param        actorRole  query     string  false  "Filter by actor role"
// @Param        resource   query     string  false  "Filter by resource type"
// @Param        dateFrom   query     string  false  "Start date (YYYY-MM-DD)"
// @Param        dateTo     query     string  false  "End date (YYYY-MM-DD)"
// @Success      200  {file}  binary  "CSV file download"
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/audit/export [get]
func (h *Handler) ExportAuditCSV(c *gin.Context) {
	f := AuditFilters{
		EventType: c.Query("eventType"),
		ActorRole: c.Query("actorRole"),
		Resource:  c.Query("resource"),
		DateFrom:  c.Query("dateFrom"),
		DateTo:    c.Query("dateTo"),
	}

	csv, err := h.svc.BuildAuditCSV(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate CSV"})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="lifegate-audit-log.csv"`)
	c.Header("Content-Length", fmt.Sprintf("%d", len(csv)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", csv)
}

// ─── GET /api/admin/transactions ─────────────────────────────────────────────

// GetAllTransactions returns a paginated admin view of all payment transactions.
//
// @Summary      Admin transaction list
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        status    query     string   false  "Filter by status: pending|success|failed"
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 20)"
// @Success      200   {object}  object{success=bool,data=array,meta=object}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/transactions [get]
func (h *Handler) GetAllTransactions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	status := c.Query("status")

	txns, total, err := h.svc.GetAllTransactions(status, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load transactions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    txns,
		"meta":    gin.H{"total": total, "page": page, "pageSize": pageSize},
	})
}

// ─── GET /api/admin/transactions/export ──────────────────────────────────────

// ExportTransactionsCSV streams a CSV of all payment transactions.
//
// @Summary      Export transactions CSV
// @Tags         admin
// @Produce      text/csv
// @Security     BearerAuth
// @Param        status  query     string  false  "Filter by status"
// @Success      200  {file}  binary  "CSV file download"
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/transactions/export [get]
func (h *Handler) ExportTransactionsCSV(c *gin.Context) {
	status := c.Query("status")
	csv, err := h.svc.BuildTransactionCSV(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate CSV"})
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="lifegate-transactions.csv"`)
	c.Header("Content-Length", fmt.Sprintf("%d", len(csv)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", csv)
}

// ─── GET /api/admin/compliance/ndpa ──────────────────────────────────────────

// GetNDPASnapshots returns recent NDPA 2023 compliance snapshots.
//
// @Summary      NDPA compliance snapshots
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        limit  query     integer  false  "Max results (default 30)"
// @Success      200    {object}  object{success=bool,data=array}
// @Failure      500    {object}  object{success=bool,message=string}
// @Router       /admin/compliance/ndpa [get]
func (h *Handler) GetNDPASnapshots(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	snaps, err := h.svc.GetNDPASnapshots(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load NDPA snapshots"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": snaps})
}

// ─── POST /api/admin/compliance/ndpa/generate ────────────────────────────────

// GenerateNDPASnapshot computes and persists a fresh NDPA compliance snapshot.
//
// @Summary      Generate NDPA snapshot
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      201  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/compliance/ndpa/generate [post]
func (h *Handler) GenerateNDPASnapshot(c *gin.Context) {
	snap, err := h.svc.GenerateNDPASnapshot()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate NDPA snapshot"})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "compliance.ndpa_snapshot", "compliance", &snap.ID,
		map[string]interface{}{"snapshotDate": snap.SnapshotDate})

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": snap})
}

// ─── GET /api/admin/compliance/ndpa/export ───────────────────────────────────

// ExportNDPACSV streams a CSV of NDPA compliance snapshots.
//
// @Summary      Export NDPA compliance CSV
// @Tags         admin
// @Produce      text/csv
// @Security     BearerAuth
// @Param        limit  query     integer  false  "Max records (default 90)"
// @Success      200  {file}  binary  "CSV file download"
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/compliance/ndpa/export [get]
func (h *Handler) ExportNDPACSV(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "90"))
	snaps, err := h.svc.GetNDPASnapshots(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate CSV"})
		return
	}

	var data []byte
	data = append(data, 0xEF, 0xBB, 0xBF) // UTF-8 BOM
	data = append(data, []byte("Snapshot Date,Data Subjects,Consent Captured %,Data Min OK,Retention OK,Breach Incidents (30d),Pending DSAR,Created At\n")...)
	for _, s := range snaps {
		dm := "No"
		if s.DataMinimisationOk {
			dm = "Yes"
		}
		rp := "No"
		if s.RetentionPolicyOk {
			rp = "Yes"
		}
		line := fmt.Sprintf("%s,%d,%.2f,%s,%s,%d,%d,%s\n",
			s.SnapshotDate, s.TotalDataSubjects, s.ConsentCapturedPct,
			dm, rp, s.BreachIncidents30d, s.PendingDSAR, s.CreatedAt)
		data = append(data, []byte(line)...)
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="lifegate-ndpa-compliance.csv"`)
	c.Header("Content-Length", fmt.Sprintf("%d", len(data)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", data)
}

// ─── GET /api/admin/settings/alerts ──────────────────────────────────────────

// GetAlertThresholds returns all configurable alert thresholds.
//
// @Summary      Get alert thresholds
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/settings/alerts [get]
func (h *Handler) GetAlertThresholds(c *gin.Context) {
	thresholds, err := h.svc.GetAlertThresholds()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load alert thresholds"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": thresholds})
}

// ─── PATCH /api/admin/settings/alerts/:key ───────────────────────────────────

// UpdateAlertThreshold updates a single threshold's value and enabled state.
//
// @Summary      Update alert threshold
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        key   path      string                              true  "Threshold key"
// @Param        body  body      object{value=number,enabled=bool}   true  "New values"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/settings/alerts/{key} [patch]
func (h *Handler) UpdateAlertThreshold(c *gin.Context) {
	key := c.Param("key")
	var body struct {
		Value   float64 `json:"value"`
		Enabled *bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	if err := h.svc.UpdateAlertThreshold(adminIDStr, key, body.Value, enabled); err != nil {
		status := http.StatusInternalServerError
		if err.Error()[:9] == "threshold" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}

	h.svc.LogAction(adminIDStr, "alert_threshold.update", "config", nil,
		map[string]interface{}{"key": key, "value": body.Value, "enabled": enabled})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Threshold updated"})
}
