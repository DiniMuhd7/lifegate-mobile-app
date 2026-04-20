package explore

import (
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
//
// @Summary      List explore videos
// @Tags         explore
// @Produce      json
// @Security     BearerAuth
// @Param        category  query  string  false  "Filter by category"
// @Success      200  {object}  object{success=bool,data=object{videos=array,total=integer,dailyCap=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /explore/videos [get]
func (h *Handler) ListVideos(c *gin.Context) {
	category := c.Query("category")
	videos, err := h.svc.ListVideos(category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch videos"})
		return
	}
	if videos == nil {
		videos = []Video{}
	}

	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

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

// ClaimReward records that a user watched and earned coins for a video.
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
