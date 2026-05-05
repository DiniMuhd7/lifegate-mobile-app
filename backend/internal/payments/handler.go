package payments

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/notifications"
	"github.com/gin-gonic/gin"
)

// Handler exposes payment and credits HTTP endpoints.
type Handler struct {
	svc      *Service
	pushSvc  *notifications.Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetPushNotifier wires in the push notification service so the handler can
// notify patients when their redemption request is approved or rejected.
func (h *Handler) SetPushNotifier(push *notifications.Service) {
	h.pushSvc = push
}

// GetBundles returns all available credit bundle options.
//
// @Summary      List credit bundles
// @Tags         payments
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Router       /payments/bundles [get]
func (h *Handler) GetBundles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    h.svc.GetBundles(),
	})
}

// GetCreditBalance returns the authenticated user's credit balance.
//
// @Summary      Get credit balance
// @Tags         payments
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object{balance=integer,currency=string}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /credits/balance [get]
func (h *Handler) GetCreditBalance(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	bal, err := h.svc.GetCreditBalance(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": bal})
}

// InitiatePayment creates a Flutterwave payment link for a credit bundle.
//
// @Summary      Initiate payment
// @Tags         payments
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{bundleId=string,name=string}  true  "Bundle selection"
// @Success      200   {object}  object{success=bool,data=object{txRef=string,paymentLink=string}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /payments/initiate [post]
func (h *Handler) InitiatePayment(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)
	email, _ := c.Get("email")
	emailStr, _ := email.(string)

	var body struct {
		BundleID string `json:"bundleId" binding:"required"`
		Name     string `json:"name"`
		Currency string `json:"currency"` // "NGN" or "USD"; defaults to "NGN"
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	name := body.Name
	if name == "" {
		name = "LifeGate User"
	}

	txRef, link, err := h.svc.InitiatePayment(uid, emailStr, name, body.BundleID, body.Currency)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"txRef":       txRef,
			"paymentLink": link,
		},
	})
}

// VerifyPayment verifies a Flutterwave transaction and credits the user's account.
//
// @Summary      Verify payment
// @Tags         payments
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{txRef=string,flwTxId=string}  true  "Transaction reference"
// @Success      200   {object}  object{success=bool,message=string,data=object}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      402   {object}  object{success=bool,message=string,data=object}
// @Router       /payments/verify [post]
func (h *Handler) VerifyPayment(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	var body struct {
		TxRef   string `json:"txRef"   binding:"required"`
		FlwTxID string `json:"flwTxId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	pt, err := h.svc.VerifyAndCredit(uid, body.TxRef, body.FlwTxID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	if pt.Status == "failed" {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"success": false,
			"message": "Payment could not be verified. Please try again.",
			"data":    pt,
		})
		return
	}

	if pt.Status == "pending" {
		// FIX #6: Return HTTP 202 (Accepted) for pending instead of 200 (OK)
		// This helps clients distinguish "still processing, retry later" from "failed".
		// Transaction not yet confirmed by Flutterwave — client should retry.
		c.JSON(http.StatusAccepted, gin.H{
			"success": false,
			"message": "Payment is still processing. Please wait a moment and try again.",
			"data":    pt,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payment successful. Credits added to your account.",
		"data":    pt,
	})
}

// GetTransactions returns the authenticated user's payment transaction history.
//
// @Summary      Payment transactions
// @Tags         payments
// @Produce      json
// @Security     BearerAuth
// @Param        limit  query     integer  false  "Max records to return (default 50)"
// @Success      200    {object}  object{success=bool,data=object{transactions=array,total=integer}}
// @Failure      500    {object}  object{success=bool,message=string}
// @Router       /payments/transactions [get]
func (h *Handler) GetTransactions(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	limit := 50
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}

	txns, err := h.svc.GetTransactions(uid, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if txns == nil {
		txns = []PaymentTransaction{}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"transactions": txns,
			"total":        len(txns),
		},
	})
}

// GetLifecoinBalance returns the authenticated user's Lifecoin wallet balance.
//
// @Summary      Get Lifecoin balance
// @Tags         lifecoins
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /lifecoins/balance [get]
func (h *Handler) GetLifecoinBalance(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)
	bal, err := h.svc.GetLifecoinBalance(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": bal})
}

// GetLifecoinTransactions returns the user's Lifecoin transaction history.
//
// @Summary      Get Lifecoin transactions
// @Tags         lifecoins
// @Produce      json
// @Security     BearerAuth
// @Param        limit   query  integer  false  "Max records (default 20, max 100)"
// @Param        offset  query  integer  false  "Pagination offset"
// @Success      200     {object}  object{success=bool,data=array}
// @Failure      500     {object}  object{success=bool,message=string}
// @Router       /lifecoins/transactions [get]
func (h *Handler) GetLifecoinTransactions(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	if o := c.Query("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil {
			offset = n
		}
	}

	txns, err := h.svc.GetLifecoinTransactions(uid, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if txns == nil {
		txns = []LifecoinTransaction{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": txns})
}

// RedeemLifecoins initiates a Naira disbursement to a health firm's bank
// account as a prescription discount (health insurance waiver).
//
// @Summary      Redeem Lifecoins — health insurance waiver
// @Tags         lifecoins
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      LifecoinRedeemRequest  true  "Redemption details"
// @Success      200   {object}  object{success=bool,data=object}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      402   {object}  object{success=bool,message=string}
// @Router       /lifecoins/redeem [post]
func (h *Handler) RedeemLifecoins(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	var req LifecoinRedeemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	tx, err := h.svc.RedeemLifecoins(uid, req)
	if err != nil {
		// Insufficient balance returns a 402.
		if isInsufficientBalance(err) {
			c.JSON(http.StatusPaymentRequired, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Redemption initiated. The Naira equivalent will be disbursed to the health firm's account.",
		"data":    tx,
	})
}

// SubmitCheckinAnswers records a patient's health check-in answers for a slot.
//
// @Summary      Submit check-in answers
// @Tags         lifecoins
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{slotId=integer,answers=array}  true  "Slot answers"
// @Success      200   {object}  object{success=bool}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /checkins/answers [post]
func (h *Handler) SubmitCheckinAnswers(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	var body struct {
		SlotID  int                      `json:"slotId"  binding:"required"`
		Answers []map[string]interface{} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := h.svc.SubmitCheckinAnswers(uid, body.SlotID, body.Answers); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ClaimCheckinSlot awards Lifecoins for a completed daily check-in slot.
// The claim is idempotent — claiming the same slot twice on the same day is a no-op.
//
// @Summary      Claim check-in slot coins
// @Tags         lifecoins
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{slot_id=integer,coins=integer}  true  "Slot claim"
// @Success      200   {object}  object{success=bool}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /lifecoins/checkin [post]
func (h *Handler) ClaimCheckinSlot(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	var body struct {
		SlotID    int    `json:"slot_id" binding:"required"`
		Coins     int    `json:"coins"`
		ClaimDate string `json:"claim_date"` // optional YYYY-MM-DD; defaults to today
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if body.Coins <= 0 {
		body.Coins = 1
	}
	if err := h.svc.ClaimCheckinSlot(uid, body.SlotID, body.Coins, body.ClaimDate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "could not claim slot"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// isInsufficientBalance returns true when the error message starts with "insufficient balance".
func isInsufficientBalance(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return len(msg) >= 22 && msg[:22] == "insufficient balance: "
}

// Webhook receives Flutterwave payment event notifications and auto-credits
// users when a charge.completed event arrives with status "successful".
//
// @Summary      Flutterwave webhook
// @Tags         payments
// @Accept       json
// @Produce      json
// @Param        verif-hash  header    string  true  "Flutterwave webhook secret hash"
// @Success      200         {object}  object{success=bool}
// @Router       /payments/webhook [post]
func (h *Handler) Webhook(c *gin.Context) {
	hashHeader := c.GetHeader("verif-hash")

	var payload WebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		// Return 200 so Flutterwave doesn't keep retrying malformed payloads.
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "bad payload"})
		return
	}

	if err := h.svc.ProcessWebhook(payload, hashHeader); err != nil {
		// Log but always return 200 — Flutterwave retries on non-2xx.
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetPendingRedemptions lists all Lifecoin redemption requests awaiting admin approval.
//
// @Summary      List pending Lifecoin redemptions
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/lifecoins/redemptions [get]
func (h *Handler) GetPendingRedemptions(c *gin.Context) {
	redemptions, err := h.svc.GetPendingRedemptions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if redemptions == nil {
		redemptions = []PendingRedemption{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": redemptions})
}

// ApproveRedemption approves a pending Lifecoin redemption: deducts coins, fires FLW transfer, and notifies the patient.
//
// @Summary      Approve a Lifecoin redemption
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Transaction ID"
// @Success      200  {object}  object{success=bool,message=string,data=object}
// @Failure      400  {object}  object{success=bool,message=string}
// @Router       /admin/lifecoins/redemptions/{id}/approve [post]
func (h *Handler) ApproveRedemption(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uid, _ := adminID.(string)
	txID := c.Param("id")

	result, err := h.svc.ApproveRedemption(uid, txID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	if h.pushSvc != nil && result.UserID != "" {
		h.pushSvc.SendToUser(
			c.Request.Context(), result.UserID,
			"Redemption Approved 🎉",
			fmt.Sprintf(
				"Your %d Lifecoins redemption of \u20a6%d to %s has been approved and is being processed.",
				result.Coins, result.NairaAmount, result.HealthFirmName,
			),
			map[string]string{"action": "lifecoins_approved", "txId": txID},
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Redemption approved and transfer initiated.",
		"data":    result,
	})
}

// RejectRedemption rejects a pending Lifecoin redemption request and notifies the patient.
//
// @Summary      Reject a Lifecoin redemption
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                  true  "Transaction ID"
// @Param        body  body  object{note=string}     false "Optional rejection reason"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /admin/lifecoins/redemptions/{id}/reject [post]
func (h *Handler) RejectRedemption(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uid, _ := adminID.(string)
	txID := c.Param("id")

	var body struct {
		Note string `json:"note"`
	}
	_ = c.ShouldBindJSON(&body)

	// Fetch user ID before rejection so we can send the push notification.
	patientID, _ := h.svc.GetUserIDForRedemption(txID)

	if err := h.svc.RejectRedemption(uid, txID, body.Note); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	if h.pushSvc != nil && patientID != "" {
		msg := "Your Lifecoins redemption request was not approved."
		if body.Note != "" {
			msg += " Reason: " + body.Note
		}
		h.pushSvc.SendToUser(
			c.Request.Context(), patientID,
			"Redemption Update",
			msg,
			map[string]string{"action": "lifecoins_rejected", "txId": txID},
		)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Redemption rejected."})
}
