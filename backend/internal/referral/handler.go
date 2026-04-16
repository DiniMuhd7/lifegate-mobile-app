package referral

import (
	"net/http"

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

// GetStats returns the authenticated patient's referral code and referral history.
//
// @Summary      Get referral stats
// @Description  Returns the patient's unique referral code, total referrals, bonus credits earned, and referral list.
// @Tags         referral
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,data=Stats}
// @Router       /referral/stats [get]
func (h *Handler) GetStats(c *gin.Context) {
	uid, _ := c.Get("userID")
	userID, _ := uid.(string)

	stats, err := h.svc.GetStats(userID)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to load referral stats", nil)
		return
	}
	respond(c, http.StatusOK, true, "OK", stats)
}
