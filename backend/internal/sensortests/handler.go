package sensortests

import (
	"net/http"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/auth"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
	"github.com/gin-gonic/gin"
)

// Handler handles sensor-test interpretation requests.
type Handler struct {
	svc     *Service
	authRepo *auth.Repository
}

// NewHandler returns a new Handler.
func NewHandler(svc *Service, authRepo *auth.Repository) *Handler {
	return &Handler{svc: svc, authRepo: authRepo}
}

// InterpretVision handles POST /api/sensor-tests/vision/interpret.
//
// @Summary      Interpret vision screening results via EDIS
// @Description  Accepts an automated vision battery result and returns an LLM-backed clinical interpretation.
// @Tags         sensor-tests
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body VisionInterpretRequest true "Vision battery results"
// @Success      200 {object} SensorInterpretResponse
// @Router       /sensor-tests/vision/interpret [post]
func (h *Handler) InterpretVision(c *gin.Context) {
	var req VisionInterpretRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request body"})
		return
	}

	patient := h.resolvePatient(c)

	result, err := h.svc.InterpretVision(c.Request.Context(), req, patient)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "interpretation failed"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// InterpretHearing handles POST /api/sensor-tests/hearing/interpret.
//
// @Summary      Interpret audiometry screening results via EDIS
// @Description  Accepts automated audiometry results and returns an LLM-backed clinical interpretation.
// @Tags         sensor-tests
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body HearingInterpretRequest true "Audiometry results"
// @Success      200 {object} SensorInterpretResponse
// @Router       /sensor-tests/hearing/interpret [post]
func (h *Handler) InterpretHearing(c *gin.Context) {
	var req HearingInterpretRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request body"})
		return
	}

	patient := h.resolvePatient(c)

	result, err := h.svc.InterpretHearing(c.Request.Context(), req, patient)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "interpretation failed"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// resolvePatient fetches the authenticated user's clinical profile from the
// auth repository and maps it into an edis.PatientContext.
// If any field cannot be fetched, that field is omitted (EDIS handles nil gracefully).
func (h *Handler) resolvePatient(c *gin.Context) edis.PatientContext {
	uid, _ := c.Get("userID")
	uidStr, _ := uid.(string)

	var patient edis.PatientContext
	if uidStr == "" {
		return patient
	}

	user, err := h.authRepo.FindUserByID(uidStr)
	if err != nil || user == nil {
		return patient
	}

	patient.Name   = user.Name
	patient.Gender = user.Gender
	if user.BloodType != nil {
		patient.BloodType = *user.BloodType
	}
	if user.Genotype != nil {
		patient.Genotype = *user.Genotype
	}
	if user.Allergies != nil {
		patient.Allergies = *user.Allergies
	}
	if user.MedicalHistory != nil {
		patient.MedicalHistory = *user.MedicalHistory
	}
	if user.CurrentMedications != nil {
		patient.CurrentMedications = *user.CurrentMedications
	}

	return patient
}
