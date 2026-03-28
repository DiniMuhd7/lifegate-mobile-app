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
