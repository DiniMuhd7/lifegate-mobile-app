package review

import (
"net/http"
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
// Default to last 30 days
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

rows, err := h.svc.GetAnalysis(start, end)
if err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
return
}

c.JSON(http.StatusOK, gin.H{"success": true, "message": "Analysis fetched", "data": rows})
}
