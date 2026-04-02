package payments

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler exposes payment and credits HTTP endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
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
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	name := body.Name
	if name == "" {
		name = "LifeGate User"
	}

	txRef, link, err := h.svc.InitiatePayment(uid, emailStr, name, body.BundleID)
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
