package physician

import (
	"errors"
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

func (h *Handler) ReviewReport(c *gin.Context) {
reportID := c.Param("id")
physicianID, _ := c.Get("userID")
pid, _ := physicianID.(string)

var req struct {
Action string `json:"action" binding:"required"`
Notes  string `json:"notes"`
}
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
return
}

if err := h.svc.ReviewReport(reportID, pid, req.Action, req.Notes); err != nil {
		if errors.Is(err, ErrCaseNotPending) || errors.Is(err, ErrCaseNotActive) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
c.JSON(http.StatusOK, gin.H{"success": true, "message": "Review submitted"})
}

// GetCaseQueue handles GET /physician/cases — returns the three-bucket queue.
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

// TakeCase handles POST /physician/cases/:id/take — atomically claims a Pending
// case and transitions it to Active, locking it to the requesting physician.
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
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Case accepted"})
}
