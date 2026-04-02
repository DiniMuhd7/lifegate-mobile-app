package review

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// GetAnalysis returns physician diagnosis analysis for a date range.
//
// @Summary      Physician analysis
// @Description  Returns daily diagnosis counts for the given date range (default last 30 days) plus 10 recent activities.
// @Tags         review
// @Produce      json
// @Security     BearerAuth
// @Param        date       query     string  false  "Single date (YYYY-MM-DD). Overrides startDate/endDate."
// @Param        startDate  query     string  false  "Start of range (YYYY-MM-DD)"
// @Param        endDate    query     string  false  "End of range (YYYY-MM-DD)"
// @Success      200  {object}  object{success=bool,data=array,activities=array}
// @Failure      400  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /review/analysis [get]
func (h *Handler) GetAnalysis(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)

	var start, end time.Time

	if date := c.Query("date"); date != "" {
		d, err := time.Parse("2006-01-02", date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid date format, use YYYY-MM-DD"})
			return
		}
		start = d
		end = d.Add(24 * time.Hour)
	} else {
		startStr := c.Query("startDate")
		endStr := c.Query("endDate")
		if startStr == "" || endStr == "" {
			end = time.Now()
			start = end.AddDate(0, 0, -30)
		} else {
			var err error
			start, err = time.Parse("2006-01-02", startStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid startDate format"})
				return
			}
			end, err = time.Parse("2006-01-02", endStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid endDate format"})
				return
			}
			end = end.Add(24 * time.Hour)
		}
	}

	rows, err := h.svc.GetAnalysis(pid, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	activities, _ := h.svc.GetRecentActivities(pid, 10)
	if activities == nil {
		activities = []ActivityRecord{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "Analysis fetched",
		"data":       rows,
		"activities": activities,
	})
}

// GetDiagnoses returns the physician's paginated diagnosis records.
//
// @Summary      List physician diagnoses
// @Tags         review
// @Produce      json
// @Security     BearerAuth
// @Param        page       query     integer  false  "Page (default 1)"
// @Param        pageSize   query     integer  false  "Items per page (default 10, max 100)"
// @Param        status     query     string   false  "Filter by status"
// @Param        search     query     string   false  "Search term"
// @Param        startDate  query     string   false  "Start date filter (YYYY-MM-DD)"
// @Param        endDate    query     string   false  "End date filter (YYYY-MM-DD)"
// @Success      200  {object}  object{success=bool,data=object{records=array,total=integer,page=integer,pageSize=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /review/diagnoses [get]
func (h *Handler) GetDiagnoses(c *gin.Context) {
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

	status := c.Query("status")
	search := c.Query("search")

	var start, end time.Time
	if startStr := c.Query("startDate"); startStr != "" {
		if d, err := time.Parse("2006-01-02", startStr); err == nil {
			start = d
		}
	}
	if endStr := c.Query("endDate"); endStr != "" {
		if d, err := time.Parse("2006-01-02", endStr); err == nil {
			end = d.Add(24 * time.Hour)
		}
	}

	records, total, err := h.svc.GetDiagnoses(pid, status, search, page, pageSize, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	if records == nil {
		records = []DiagnosisRecord{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Diagnoses fetched",
		"data": gin.H{
			"records":  records,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// GetDiagnosisDetail returns a specific diagnosis record for the physician.
//
// @Summary      Get review diagnosis detail
// @Tags         review
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Diagnosis ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /review/diagnoses/{id} [get]
func (h *Handler) GetDiagnosisDetail(c *gin.Context) {
	physicianID, _ := c.Get("userID")
	pid, _ := physicianID.(string)
	id := c.Param("id")

	record, err := h.svc.GetDiagnosisDetail(pid, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if record == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Diagnosis not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Diagnosis fetched", "data": record})
}
