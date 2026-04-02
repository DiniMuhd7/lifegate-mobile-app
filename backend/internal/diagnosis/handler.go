package diagnosis

import (
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

// GetDiagnoses returns the authenticated patient's diagnoses.
//
// @Summary      List patient diagnoses
// @Tags         diagnoses
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 20, max 100)"
// @Success      200  {object}  object{success=bool,data=object{records=array,total=integer,page=integer,pageSize=integer}}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /diagnoses [get]
func (h *Handler) GetDiagnoses(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	records, total, err := h.svc.GetDiagnoses(uid, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if records == nil {
		records = []DiagnosisDetail{}
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

// GetDiagnosisDetail returns a single diagnosis by ID for the authenticated patient.
//
// @Summary      Get diagnosis detail
// @Tags         diagnoses
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Diagnosis ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /diagnoses/{id} [get]
func (h *Handler) GetDiagnosisDetail(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, _ := userID.(string)
	id := c.Param("id")

	record, err := h.svc.GetDiagnosisDetail(uid, id)
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
