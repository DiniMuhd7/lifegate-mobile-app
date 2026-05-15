package accessportal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// Handler exposes HTTP endpoints for the access request portal.
type Handler struct {
	repo      *Repository
	publicKey string
}

// NewHandler constructs an accessportal Handler.
// publicKey is the Flutterwave public key returned to the frontend for
// Inline JS checkout — it is intentionally non-secret.
func NewHandler(repo *Repository, publicKey string) *Handler {
	return &Handler{repo: repo, publicKey: publicKey}
}

// GetConfig returns the Flutterwave public key and tier definitions so the
// frontend can render the portal without hard-coding either.
//
// GET /api/public/access/config
func (h *Handler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"flwPublicKey": h.publicKey,
			"tiers":        GetTiers(),
		},
	})
}

// Submit handles a complete institutional access request.
//
// For free-tier (Government & NGO) requests no payment fields are required.
// For paid tiers the frontend must first complete Flutterwave Inline checkout
// and supply the resulting flwTxRef and flwTxId; the backend verifies the
// payment against Flutterwave before persisting the record.
//
// POST /api/public/access/submit
func (h *Handler) Submit(c *gin.Context) {
	var body SubmitBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	tier, ok := getTierByID(body.TierID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid tier"})
		return
	}

	amount, err := priceForCurrency(tier, body.Currency)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	var paymentStatus string
	if tier.Free {
		paymentStatus = "free"
		body.FlwTxRef = ""
		body.FlwTxID = ""
	} else {
		body.FlwTxRef = strings.TrimSpace(body.FlwTxRef)
		body.FlwTxID = strings.TrimSpace(body.FlwTxID)

		if body.FlwTxRef == "" || body.FlwTxID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "payment reference is required for this tier",
			})
			return
		}

		// Guard against duplicate submissions using the same Flutterwave payment.
		exists, err := h.repo.TxRefExists(c.Request.Context(), body.FlwTxRef)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "internal error"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "this payment has already been used for an access request",
			})
			return
		}

		// Verify with Flutterwave — secret key never leaves the backend.
		ok, err := h.repo.VerifyFlutterwavePayment(body.FlwTxID, amount, body.Currency)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"success": false,
				"message": fmt.Sprintf("payment verification failed: %s", err.Error()),
			})
			return
		}
		if !ok {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"success": false,
				"message": "payment could not be verified — please try again or contact support@dshub.com.ng",
			})
			return
		}
		paymentStatus = "paid"
	}

	req, err := h.repo.Save(c.Request.Context(), body, amount, paymentStatus)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to save request"})
		return
	}

	// Fire-and-forget emails — errors are only logged, never fatal.
	go func(r AccessRequest, tid string) {
		ctx := context.Background()
		tier, _ := getTierByID(tid)
		h.repo.SendReceiptEmail(ctx, r, tier.Name)
		h.repo.SendAdminAlertEmail(ctx, r, tier.Name)
	}(req, body.TierID)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":            req.ID,
			"tier":          req.Tier,
			"paymentStatus": req.PaymentStatus,
			"accessStatus":  req.AccessStatus,
			"message":       "Your access request has been received. We'll review and respond within 2–3 business days.",
		},
	})
}

// Webhook processes Flutterwave charge.completed server-to-server events.
// It validates the verif-hash signature and updates the matching request's
// payment status — serving as an out-of-band confirmation in case the
// browser callback is missed.
//
// POST /api/public/access/webhook
func (h *Handler) Webhook(c *gin.Context) {
	var payload WebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false})
		return
	}

	hashHeader := c.GetHeader("verif-hash")
	if err := h.repo.ProcessWebhook(c.Request.Context(), payload, hashHeader); err != nil {
		// Return 401 only on signature failure so Flutterwave does not retry
		// events that fail verification. All other errors return 200 to prevent
		// the webhook from being retried indefinitely.
		if strings.Contains(err.Error(), "invalid webhook signature") {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ListAccessRequests returns a paginated list of access requests for admin review.
//
// GET /api/admin/access-requests
func (h *Handler) ListAccessRequests(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	status := c.Query("status")

	list, total, err := h.repo.ListRequests(c.Request.Context(), page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to list requests"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    list,
		"meta":    gin.H{"total": total, "page": page, "pageSize": pageSize},
	})
}

// ReviewAccessRequest approves or rejects an access request and notifies the applicant.
//
// PATCH /api/admin/access-requests/:id/review
func (h *Handler) ReviewAccessRequest(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Decision   string `json:"decision"   binding:"required,oneof=approve reject"`
		AdminNotes string `json:"adminNotes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	var req AccessRequest
	var err error
	if body.Decision == "approve" {
		req, err = h.repo.ApproveRequest(c.Request.Context(), id, body.AdminNotes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		go func(r AccessRequest) {
			tier, _ := getTierByID(r.Tier)
			h.repo.SendApprovalEmail(context.Background(), r, tier.Name)
		}(req)
	} else {
		req, err = h.repo.RejectRequest(c.Request.Context(), id, body.AdminNotes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		go func(r AccessRequest) {
			tier, _ := getTierByID(r.Tier)
			h.repo.SendRejectionEmail(context.Background(), r, tier.Name)
		}(req)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": req})
}

// CheckStatus lets an applicant check their request status using their work
// email and the 8-character reference shown at submission.
//
// POST /api/public/access/status
func (h *Handler) CheckStatus(c *gin.Context) {
	var body struct {
		Email string `json:"email" binding:"required,email"`
		Ref   string `json:"ref"   binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	body.Ref = strings.TrimSpace(body.Ref)
	if len(body.Ref) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "ref must be at least 4 characters"})
		return
	}

	req, err := h.repo.CheckStatusByEmailRef(c.Request.Context(), body.Email, body.Ref)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "no matching request found — check your email and reference"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "internal error"})
		return
	}

	// Strip API key unless the request is approved.
	if req.AccessStatus != "approved" {
		req.APIKey = ""
	}
	tier, _ := getTierByID(req.Tier)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"ref":           req.ID[:8],
			"tier":          req.Tier,
			"tierName":      tier.Name,
			"accessStatus":  req.AccessStatus,
			"paymentStatus": req.PaymentStatus,
			"apiKey":        req.APIKey,
			"approvedAt":    req.ApprovedAt,
			"submittedAt":   req.CreatedAt,
		},
	})
}
