package admin

import (
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ─── GET /api/admin/patients/export ──────────────────────────────────────────

// ExportPatientRegistrationsCSV streams a CSV download of patient registrations.
//
// @Summary      Export patient registrations
// @Tags         admin
// @Produce      text/csv
// @Security     BearerAuth
// @Param        dateFrom  query     string  false  "Start date (YYYY-MM-DD)"
// @Param        dateTo    query     string  false  "End date (YYYY-MM-DD)"
// @Success      200  {file}  binary  "CSV file download"
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /admin/patients/export [get]
func (h *Handler) ExportPatientRegistrationsCSV(c *gin.Context) {
	dateFrom := c.Query("dateFrom")
	dateTo := c.Query("dateTo")

	csv, err := h.svc.BuildPatientRegistrationCSV(dateFrom, dateTo)
	if err != nil {
		log.Printf("[admin] ExportPatientRegistrationsCSV: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate CSV"})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="lifegate-patient-registrations.csv"`)
	c.Header("Content-Length", fmt.Sprintf("%d", len(csv)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", csv)
}

// ─── GET /api/admin/patients ─────────────────────────────────────────────────

// GetPatientRegistrations returns a paginated list of patient registrations.
//
// @Summary      List patient registrations
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        page      query     integer  false  "Page (default 1)"
// @Param        pageSize  query     integer  false  "Items per page (default 100, max 1000)"
// @Param        dateFrom  query     string   false  "Start date (YYYY-MM-DD)"
// @Param        dateTo    query     string   false  "End date (YYYY-MM-DD)"
// @Success      200   {object}  object{success=bool,data=array,meta=object}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/patients [get]
func (h *Handler) GetPatientRegistrations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "100"))
	dateFrom := c.Query("dateFrom")
	dateTo := c.Query("dateTo")

	patients, total, err := h.svc.GetPatientRegistrations(dateFrom, dateTo, page, pageSize)
	if err != nil {
		log.Printf("[admin] GetPatientRegistrations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load patient registrations"})
		return
	}

	if patients == nil {
		patients = []PatientRegistrationRow{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    patients,
		"meta": gin.H{
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

// ─── POST /api/admin/patients/import-health-data ──────────────────────────────

// ImportPatientHealthData processes a bulk CSV import of patient health data.
//
// @Summary      Import patient health data from CSV
// @Tags         admin
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "CSV file with patient health data"
// @Success      200   {object}  object{success=bool,message=string,imported=integer,errors=array}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      500   {object}  object{success=bool,message=string}
// @Router       /admin/patients/import-health-data [post]
func (h *Handler) ImportPatientHealthData(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "No file provided"})
		return
	}

	// Open and read the file
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Failed to open file"})
		return
	}
	defer src.Close()

	// Read file into memory
	buf := make([]byte, file.Size)
	if _, err := src.Read(buf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Failed to read file"})
		return
	}

	// Parse CSV
	rows, err := h.svc.ParsePatientHealthCSV(buf)
	if err != nil {
		log.Printf("[admin] ImportPatientHealthData parse error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": fmt.Sprintf("CSV parse error: %v", err)})
		return
	}

	// Update patient data
	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	successCount, importErrors, err := h.svc.UpdatePatientHealthData(rows, adminIDStr)
	if err != nil {
		log.Printf("[admin] ImportPatientHealthData update error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Import processing failed"})
		return
	}

	// Log the import action
	h.svc.LogAction(adminIDStr, "patient.health_data_import", "patient",
		nil,
		map[string]interface{}{
			"totalRows":  len(rows),
			"successful": successCount,
			"errors":     len(importErrors),
		})

	successMsg := fmt.Sprintf("Successfully imported health data for %d patient(s)", successCount)
	if len(importErrors) > 0 {
		successMsg = fmt.Sprintf("%s with %d error(s)", successMsg, len(importErrors))
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  successMsg,
		"imported": successCount,
		"errors":   importErrors,
	})
}

// ─── GET /api/admin/patients/:id/health ──────────────────────────────────────

// GetPatientHealth returns detailed health information for a patient.
//
// @Summary      Get patient health data
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Patient user ID"
// @Success      200  {object}  object{success=bool,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /admin/patients/{id}/health [get]
func (h *Handler) GetPatientHealth(c *gin.Context) {
	patientID := c.Param("id")

	health, err := h.svc.GetPatientHealth(patientID)
	if err != nil {
		if err.Error() == "not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Patient not found"})
			return
		}
		log.Printf("[admin] GetPatientHealth %s: %v", patientID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load patient health data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": health})
}

// ─── PATCH /api/admin/patients/:id/health ───────────────────────────────────

// UpdatePatientHealth updates a patient's health information.
//
// @Summary      Update patient health data
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string  true  "Patient user ID"
// @Param        body  body      object  true  "Health data fields to update"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      404   {object}  object{success=bool,message=string}
// @Router       /admin/patients/{id}/health [patch]
func (h *Handler) UpdatePatientHealth(c *gin.Context) {
	patientID := c.Param("id")

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body"})
		return
	}

	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)

	if err := h.svc.UpdatePatientHealthDirect(patientID, body, adminIDStr); err != nil {
		if err.Error() == "not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Patient not found"})
			return
		}
		log.Printf("[admin] UpdatePatientHealth %s: %v", patientID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update patient health data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Patient health data updated"})
}

// GetPatients returns patients registered within a required date range.
func (h *Handler) GetPatients(c *gin.Context) {
	dateFrom := c.Query("dateFrom")
	dateTo := c.Query("dateTo")
	if dateFrom == "" || dateTo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "dateFrom and dateTo are required (YYYY-MM-DD)"})
		return
	}
	patients, err := h.svc.GetPatientsForExport(dateFrom, dateTo)
	if err != nil {
		log.Printf("[admin] GetPatients: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load patients"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": patients})
}

// ExportPatientsCSV streams a CSV of patients registered within a required date range.
func (h *Handler) ExportPatientsCSV(c *gin.Context) {
	dateFrom := c.Query("dateFrom")
	dateTo := c.Query("dateTo")
	if dateFrom == "" || dateTo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "dateFrom and dateTo are required (YYYY-MM-DD)"})
		return
	}
	testType := c.Query("testType")
	csvData, err := h.svc.BuildPatientsCSV(dateFrom, dateTo, testType)
	if err != nil {
		log.Printf("[admin] ExportPatientsCSV: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate CSV"})
		return
	}
	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "patients.export", "user", nil, map[string]interface{}{"dateFrom": dateFrom, "dateTo": dateTo, "testType": testType})
	filename := fmt.Sprintf("lifegate-patients-%s-to-%s.csv", dateFrom, dateTo)
	if strings.TrimSpace(testType) != "" {
		filename = fmt.Sprintf("lifegate-patients-%s-%s-to-%s.csv", normalizeHeader(testType), dateFrom, dateTo)
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Length", fmt.Sprintf("%d", len(csvData)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", csvData)
}

// ImportPatientsCSV accepts a CSV upload and bulk-updates existing patients by email.
func (h *Handler) ImportPatientsCSV(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "CSV file is required (field name: file)"})
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Could not read uploaded file"})
		return
	}
	defer f.Close()
	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	headerRow, err := reader.Read()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "CSV file is empty or malformed"})
		return
	}
	emailCol := -1
	for i, col := range headerRow {
		if normalizeHeader(col) == "email" {
			emailCol = i
			break
		}
	}
	if emailCol == -1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": `CSV must include an "email" column to match patients`})
		return
	}
	testType := c.PostForm("testType")
	summary := PatientImportSummary{Results: []PatientImportRowResult{}}
	rowNum := 1
	for {
		record, err := reader.Read()
		if err != nil {
			break
		}
		rowNum++
		summary.TotalRows++
		if emailCol >= len(record) {
			summary.Failed++
			continue
		}
		email := strings.TrimSpace(record[emailCol])
		fields := map[string]string{}
		for i, val := range record {
			if i == emailCol || i >= len(headerRow) {
				continue
			}
			fields[headerRow[i]] = val
		}
		if updErr := h.svc.UpdatePatientFromCSVRowForTest(email, fields, testType); updErr != nil {
			summary.Failed++
			summary.Results = append(summary.Results, PatientImportRowResult{Row: rowNum, Email: email, Status: "error", Message: updErr.Error()})
			continue
		}
		summary.Updated++
		summary.Results = append(summary.Results, PatientImportRowResult{Row: rowNum, Email: email, Status: "updated"})
		if patientID, idErr := h.svc.FindPatientUserIDByEmail(email); idErr == nil {
			h.notifyPatientTestResultsAvailable(patientID)
		}
	}
	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "patients.import", "user", nil, map[string]interface{}{"totalRows": summary.TotalRows, "updated": summary.Updated, "failed": summary.Failed, "testType": testType})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": summary})
}

// UpdatePatientHealthByEmail updates a patient's health data from the admin dashboard.
func (h *Handler) UpdatePatientHealthByEmail(c *gin.Context) {
	var body struct {
		Email    string            `json:"email"`
		Fields   map[string]string `json:"fields"`
		TestType string            `json:"testType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body"})
		return
	}
	body.Email = strings.TrimSpace(body.Email)
	if body.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Patient email is required"})
		return
	}
	if len(body.Fields) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "At least one health field is required"})
		return
	}
	if err := h.svc.UpdatePatientFromCSVRowForTest(body.Email, body.Fields, body.TestType); err != nil {
		log.Printf("[admin] UpdatePatientHealthByEmail %s: %v", body.Email, err)
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if patientID, idErr := h.svc.FindPatientUserIDByEmail(body.Email); idErr == nil {
		h.notifyPatientTestResultsAvailable(patientID)
	}
	adminID, _ := c.Get("userID")
	adminIDStr, _ := adminID.(string)
	h.svc.LogAction(adminIDStr, "patients.health_data_update", "user", nil, map[string]interface{}{"email": body.Email, "fields": body.Fields, "testType": body.TestType})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Patient health data updated"})
}
