package lifefund

import (
	"net/http"
	"strconv"

	auditpkg "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/audit"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func respond(c *gin.Context, code int, success bool, message string, data interface{}) {
	body := gin.H{"success": success, "message": message}
	if data != nil {
		body["data"] = data
	}
	c.JSON(code, body)
}

func fail(c *gin.Context, err error) {
	if ve, ok := err.(*ValidationError); ok {
		respond(c, http.StatusUnprocessableEntity, false, ve.Message, nil)
		return
	}
	respond(c, http.StatusInternalServerError, false, "Something went wrong. Please try again.", nil)
}

func currentUser(c *gin.Context) (id, role string) {
	uid, _ := c.Get("userID")
	r, _ := c.Get("role")
	id, _ = uid.(string)
	role, _ = r.(string)
	return
}

// ── Patient endpoints ────────────────────────────────────────────────────

// GetAccount returns the authenticated patient's LifeFund account: status,
// dynamic credit limit, outstanding balance, and why they're in that state.
//
// @Summary      Get LifeFund account
// @Tags         lifefund
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=Account}
// @Router       /lifefund/account [get]
func (h *Handler) GetAccount(c *gin.Context) {
	userID, _ := currentUser(c)
	acc, result, err := h.svc.GetAccountOverview(userID)
	if err != nil {
		fail(c, err)
		return
	}
	respond(c, http.StatusOK, true, "OK", gin.H{"account": acc, "eligibility": result})
}

// SubmitRequest opens a new LifeFund financing request.
//
// @Summary      Submit a LifeFund request
// @Tags         lifefund
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  SubmitRequestInput  true  "Request details"
// @Success      201  {object}  object{success=bool,data=Request}
// @Router       /lifefund/requests [post]
func (h *Handler) SubmitRequest(c *gin.Context) {
	userID, _ := currentUser(c)
	var in SubmitRequestInput
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body.", nil)
		return
	}
	req, err := h.svc.SubmitRequest(c.Request.Context(), userID, in)
	if err != nil {
		fail(c, err)
		return
	}
	auditpkg.Log(c.Request.Context(), userID, "user", "lifefund.request.submitted",
		"lifefund_request", req.ID, nil, req, nil, c.ClientIP())
	respond(c, http.StatusCreated, true, "LifeFund request submitted for review.", req)
}

// ListMyRequests returns the authenticated patient's LifeFund request history.
//
// @Summary      List my LifeFund requests
// @Tags         lifefund
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=[]Request}
// @Router       /lifefund/requests [get]
func (h *Handler) ListMyRequests(c *gin.Context) {
	userID, _ := currentUser(c)
	reqs, err := h.svc.ListMyRequests(userID)
	if err != nil {
		fail(c, err)
		return
	}
	respond(c, http.StatusOK, true, "OK", reqs)
}

// GetMyRequest returns one of the authenticated patient's requests, including
// its repayment schedule and payment history.
//
// @Summary      Get a LifeFund request
// @Tags         lifefund
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Request ID"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /lifefund/requests/{id} [get]
func (h *Handler) GetMyRequest(c *gin.Context) {
	userID, _ := currentUser(c)
	req, err := h.svc.GetRequestForUser(userID, c.Param("id"))
	if err != nil {
		fail(c, err)
		return
	}
	if req == nil {
		respond(c, http.StatusNotFound, false, "Request not found.", nil)
		return
	}
	respond(c, http.StatusOK, true, "OK", req)
}

// AcceptAgreement records the patient's explicit acceptance of the financing
// agreement shown for an APPROVED request.
//
// @Summary      Accept LifeFund agreement
// @Tags         lifefund
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Request ID"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /lifefund/requests/{id}/accept [post]
func (h *Handler) AcceptAgreement(c *gin.Context) {
	userID, _ := currentUser(c)
	req, err := h.svc.AcceptAgreement(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		fail(c, err)
		return
	}
	auditpkg.Log(c.Request.Context(), userID, "user", "lifefund.agreement.accepted",
		"lifefund_request", req.ID, nil, req, nil, c.ClientIP())
	respond(c, http.StatusOK, true, "Agreement accepted.", req)
}

// SubmitRepayment records a repayment made by the authenticated patient
// against one of their own requests (e.g. after a Flutterwave charge).
//
// @Summary      Record a LifeFund repayment
// @Tags         lifefund
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                 true  "Request ID"
// @Param        body  body  RecordRepaymentInput   true  "Payment details"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /lifefund/requests/{id}/repayments [post]
func (h *Handler) SubmitRepayment(c *gin.Context) {
	userID, _ := currentUser(c)
	requestID := c.Param("id")

	owned, err := h.svc.GetRequestForUser(userID, requestID)
	if err != nil {
		fail(c, err)
		return
	}
	if owned == nil {
		respond(c, http.StatusNotFound, false, "Request not found.", nil)
		return
	}

	var in RecordRepaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body.", nil)
		return
	}
	req, err := h.svc.RecordRepayment(c.Request.Context(), requestID, in)
	if err != nil {
		fail(c, err)
		return
	}
	auditpkg.Log(c.Request.Context(), userID, "user", "lifefund.repayment.recorded",
		"lifefund_request", req.ID, nil, req, gin.H{"amount": in.Amount}, c.ClientIP())
	respond(c, http.StatusOK, true, "Repayment recorded.", req)
}

// ── Admin endpoints ──────────────────────────────────────────────────────

// AdminDashboard returns aggregate LifeFund counts for the admin overview.
//
// @Summary      LifeFund admin dashboard
// @Tags         lifefund-admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=DashboardSummary}
// @Router       /admin/lifefund/dashboard [get]
func (h *Handler) AdminDashboard(c *gin.Context) {
	summary, err := h.svc.DashboardSummary()
	if err != nil {
		fail(c, err)
		return
	}
	respond(c, http.StatusOK, true, "OK", summary)
}

// AdminListRequests lists LifeFund requests for the admin review queue, with
// optional status/search filters and pagination.
//
// @Summary      List LifeFund requests (admin)
// @Tags         lifefund-admin
// @Produce      json
// @Security     BearerAuth
// @Param        status    query  string  false  "Filter by status"
// @Param        search    query  string  false  "Search by patient name/email"
// @Param        page      query  int     false  "Page number"
// @Param        pageSize  query  int     false  "Page size"
// @Success      200  {object}  object{success=bool,data=[]Request}
// @Router       /admin/lifefund/requests [get]
func (h *Handler) AdminListRequests(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize"))
	reqs, total, err := h.svc.ListRequestsAdmin(AdminListFilters{
		Status:   c.Query("status"),
		Search:   c.Query("search"),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		fail(c, err)
		return
	}
	respond(c, http.StatusOK, true, "OK", gin.H{"requests": reqs, "total": total})
}

// AdminGetRequest returns full detail for one request: bill/provider info,
// documents, schedule, repayment history, and its audit trail.
//
// @Summary      Get a LifeFund request (admin)
// @Tags         lifefund-admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Request ID"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /admin/lifefund/requests/{id} [get]
func (h *Handler) AdminGetRequest(c *gin.Context) {
	req, audit, err := h.svc.GetRequestAdmin(c.Param("id"))
	if err != nil {
		fail(c, err)
		return
	}
	if req == nil {
		respond(c, http.StatusNotFound, false, "Request not found.", nil)
		return
	}
	respond(c, http.StatusOK, true, "OK", gin.H{"request": req, "auditTrail": audit})
}

// AdminApplyAction runs one admin decision (approve/reject/reduce/suspend/
// escalate/restructure/provider-review/disburse) against a request. Every
// call is written to the shared audit trail with a before/after snapshot.
//
// @Summary      Act on a LifeFund request (admin)
// @Tags         lifefund-admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string             true  "Request ID"
// @Param        body  body  AdminActionInput   true  "Action to apply"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /admin/lifefund/requests/{id}/action [post]
func (h *Handler) AdminApplyAction(c *gin.Context) {
	adminID, role := currentUser(c)
	requestID := c.Param("id")

	before, err := h.svc.GetRequestAdminRaw(requestID)
	if err != nil {
		fail(c, err)
		return
	}

	var in AdminActionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body.", nil)
		return
	}

	after, err := h.svc.ApplyAdminAction(c.Request.Context(), adminID, requestID, in)
	if err != nil {
		fail(c, err)
		return
	}

	auditpkg.Log(c.Request.Context(), adminID, role, "lifefund.admin_action."+in.Action,
		"lifefund_request", requestID, before, after, gin.H{"notes": in.Notes}, c.ClientIP())

	respond(c, http.StatusOK, true, "Action applied.", after)
}

// AdminRecordRepayment lets an admin manually record an offline repayment
// (e.g. bank transfer confirmed outside Flutterwave) against a request.
//
// @Summary      Record a LifeFund repayment (admin)
// @Tags         lifefund-admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                true  "Request ID"
// @Param        body  body  RecordRepaymentInput  true  "Payment details"
// @Success      200  {object}  object{success=bool,data=Request}
// @Router       /admin/lifefund/requests/{id}/repayments [post]
func (h *Handler) AdminRecordRepayment(c *gin.Context) {
	adminID, role := currentUser(c)
	requestID := c.Param("id")

	var in RecordRepaymentInput
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body.", nil)
		return
	}
	if in.Method == "" {
		in.Method = "admin_manual"
	}
	req, err := h.svc.RecordRepayment(c.Request.Context(), requestID, in)
	if err != nil {
		fail(c, err)
		return
	}
	auditpkg.Log(c.Request.Context(), adminID, role, "lifefund.repayment.recorded_by_admin",
		"lifefund_request", req.ID, nil, req, gin.H{"amount": in.Amount}, c.ClientIP())
	respond(c, http.StatusOK, true, "Repayment recorded.", req)
}
