package explore

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for the explore feature.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ListVideos returns the active video catalogue.
// An optional ?category= query parameter filters results to a single category.
// An optional ?lang= query parameter overrides the user's stored language
// preference (e.g. "en", "fr", "yo") so the mobile client can pass the
// in-memory language instantly without waiting for a profile-sync DB write.
//
// @Summary      List explore videos
// @Tags         explore
// @Produce      json
// @Security     BearerAuth
// @Param        category  query  string  false  "Filter by category"
// @Param        lang      query  string  false  "Language override (ISO 639-1)"
// @Success      200  {object}  object{success=bool,data=object{videos=array,total=integer,dailyCap=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /explore/videos [get]
func (h *Handler) ListVideos(c *gin.Context) {
	category := c.Query("category")
	lang := c.Query("lang")
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)
	videos, err := h.svc.ListVideos(uid, category, lang)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch videos"})
		return
	}
	if videos == nil {
		videos = []Video{}
	}

	rewardedIDs, err := h.svc.GetDailyRewardedIDs(uid)
	if err != nil || rewardedIDs == nil {
		rewardedIDs = []string{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"videos":      videos,
			"total":       len(videos),
			"dailyCap":    DailyVideoCap,
			"rewardedIds": rewardedIDs,
		},
	})
}

// TriggerRefresh forces an immediate YouTube catalogue refresh.
// Admin only — protected at the route level.
//
// @Summary      Trigger explore video refresh
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      202  {object}  object{success=bool,message=string}
// @Router       /admin/explore/refresh [post]
func (h *Handler) TriggerRefresh(c *gin.Context) {
	go h.svc.TriggerRefresh()
	c.JSON(http.StatusAccepted, gin.H{"success": true, "message": "Video catalogue refresh started"})
}
//
// @Summary      Claim video reward
// @Tags         explore
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  object{videoId=string}  true  "Video ID"
// @Success      200   {object}  object{success=bool,data=object{coinsEarned=integer,alreadyClaimed=bool,capReached=bool}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /explore/claim [post]
func (h *Handler) ClaimReward(c *gin.Context) {
	var req struct {
		VideoID string `json:"videoId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "videoId is required"})
		return
	}

	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	coins, alreadyClaimed, capReached, err := h.svc.ClaimReward(uid, req.VideoID)
	if err == sql.ErrNoRows {
		// Video not found in the backend catalogue — the client will fall back
		// to its offline reward path which uses locally-stored coin values.
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "video not found in catalogue"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to record reward"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"coinsEarned":   coins,
			"alreadyClaimed": alreadyClaimed,
			"capReached":    capReached,
		},
	})
}
