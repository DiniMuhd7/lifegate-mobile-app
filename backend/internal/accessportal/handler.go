package accessportal

import (
	"fmt"
	"net/http"
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
