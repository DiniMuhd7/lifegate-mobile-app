package admin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// ─── Domain types ─────────────────────────────────────────────────────────────

// PatientRow is a single patient/user record for the admin patients list & CSV export.
type PatientRow struct {
	ID          string  `json:"id"`
	PatientID   string  `json:"patientId"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Phone       string  `json:"phone"`
	Gender      string  `json:"gender"`
	DOB         string  `json:"dob"`
	BloodGroup  string  `json:"bloodGroup"`
	Genotype    string  `json:"genotype"`
	HeightCM    float64 `json:"heightCm"`
	WeightKG    float64 `json:"weightKg"`
	BMI         float64 `json:"bmi,omitempty"`
	TestResults string  `json:"testResults"` // raw JSON object as string, e.g. {"hemoglobin":"13.5"}
	CreatedAt   string  `json:"createdAt"`
}

// PatientImportRowResult reports the outcome of a single CSV row during bulk import.
type PatientImportRowResult struct {
	Row     int    `json:"row"`
	Email   string `json:"email"`
	Status  string `json:"status"` // "updated" | "error"
	Message string `json:"message,omitempty"`
}

// PatientImportSummary is the full result of a CSV bulk-import operation.
type PatientImportSummary struct {
	TotalRows int                       `json:"totalRows"`
	Updated   int                       `json:"updated"`
	Failed    int                       `json:"failed"`
	Results   []PatientImportRowResult  `json:"results"`
}

// recognizedPatientColumns maps normalized (lowercase, no spaces/underscores)
// CSV header names to the users table column they update.
var recognizedPatientColumns = map[string]string{
	"bloodgroup": "blood_type",
	"bloodtype":  "blood_type",
	"genotype":   "genotype",
	"heightcm":   "height_cm",
	"height":     "height_cm",
	"weightkg":   "weight_kg",
	"weight":     "weight_kg",
}

// normalizeHeader lowercases a CSV header and strips spaces/underscores/hyphens
// so "Blood Group", "blood_group", and "bloodgroup" all match the same key.
func normalizeHeader(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.NewReplacer(" ", "", "_", "", "-", "").Replace(h)
	return h
}

// ─── Export ────────────────────────────────────────────────────────────────────

// GetPatientsForExport returns all patients (role='user') registered within
// the given inclusive date range, ordered by registration date.
func (r *Repository) GetPatientsForExport(dateFrom, dateTo string) ([]PatientRow, error) {
	rows, err := r.db.Query(`
		SELECT id::text, COALESCE(patient_id,''), name, email, COALESCE(phone,''),
		       COALESCE(gender,''), COALESCE(dob,''), COALESCE(blood_type,''),
		       COALESCE(genotype,''), COALESCE(height_cm,0), COALESCE(weight_kg,0),
		       COALESCE(test_results::text, '{}'), created_at::text
		FROM users
		WHERE role = 'user'
		  AND created_at::date >= $1::date
		  AND created_at::date <= $2::date
		ORDER BY created_at ASC`, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PatientRow
	for rows.Next() {
		var p PatientRow
		if err := rows.Scan(&p.ID, &p.PatientID, &p.Name, &p.Email, &p.Phone,
			&p.Gender, &p.DOB, &p.BloodGroup, &p.Genotype, &p.HeightCM, &p.WeightKG,
			&p.TestResults, &p.CreatedAt); err != nil {
			return nil, err
		}
		if p.HeightCM > 0 && p.WeightKG > 0 {
			heightM := p.HeightCM / 100
			p.BMI = p.WeightKG / (heightM * heightM)
		}
		out = append(out, p)
	}
	if out == nil {
		out = []PatientRow{}
	}
	return out, rows.Err()
}

// BuildPatientsCSV generates a CSV export of patients registered within the
// given inclusive date range (YYYY-MM-DD), for the admin "export patients" feature.
func (r *Repository) BuildPatientsCSV(dateFrom, dateTo string) ([]byte, error) {
	patients, err := r.GetPatientsForExport(dateFrom, dateTo)
=======
	"encoding/csv"
	"fmt"
	"time"
)

// ─── Patient Registration Export ────────────────────────────────────────────

// PatientRegistrationRow represents a single patient registration record for export.
type PatientRegistrationRow struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Email             string `json:"email"`
	Phone             string `json:"phone"`
	DOB               string `json:"dob"`
	Gender            string `json:"gender"`
	BloodType         string `json:"bloodType"`
	Genotype          string `json:"genotype"`
	BMI               string `json:"bmi"`
	Language          string `json:"language"`
	Country           string `json:"country"`
	State             string `json:"state"`
	RegistrationDate  string `json:"registrationDate"`
	LastActivityDate  string `json:"lastActivityDate"`
}

// GetPatientRegistrations returns a paginated list of patient registrations optionally filtered by date range.
func (r *Repository) GetPatientRegistrations(dateFrom, dateTo string, page, pageSize int) ([]PatientRegistrationRow, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 100
	}
	offset := (page - 1) * pageSize

	where := "WHERE u.role IN ('user', 'patient')"
	args := []interface{}{}
	n := 1

	if dateFrom != "" {
		where += fmt.Sprintf(" AND u.created_at >= $%d::date", n)
		args = append(args, dateFrom)
		n++
	}
	if dateTo != "" {
		// Inclusive: include the entire end date, so add 1 day and query <
		where += fmt.Sprintf(" AND u.created_at < $%d::date + INTERVAL '1 day'", n)
		args = append(args, dateTo)
		n++
	}

	// Count query
	countQ := fmt.Sprintf(`
		SELECT COUNT(*) FROM users u
		%s`, where)

	var total int
	if err := r.db.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Data query
	limitArgs := append(args, pageSize, offset)
	dataQ := fmt.Sprintf(`
		SELECT
			u.id::text,
			COALESCE(u.name, ''),
			COALESCE(u.email, ''),
			COALESCE(u.phone, ''),
			COALESCE(u.dob, ''),
			COALESCE(u.gender, ''),
			COALESCE(u.blood_type, ''),
			COALESCE(u.genotype, ''),
			COALESCE(u.bmi, ''),
			COALESCE(u.language, ''),
			COALESCE(u.country, ''),
			COALESCE(u.state, ''),
			u.created_at::text,
			COALESCE(u.updated_at::text, u.created_at::text)
		FROM users u
		%s
		ORDER BY u.created_at DESC
		LIMIT $%d OFFSET $%d`, where, n, n+1)

	rows, err := r.db.Query(dataQ, limitArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var patients []PatientRegistrationRow
	for rows.Next() {
		var p PatientRegistrationRow
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Email, &p.Phone, &p.DOB, &p.Gender,
			&p.BloodType, &p.Genotype, &p.BMI, &p.Language,
			&p.Country, &p.State, &p.RegistrationDate, &p.LastActivityDate,
		); err != nil {
			return nil, 0, err
		}
		patients = append(patients, p)
	}

	if patients == nil {
		patients = []PatientRegistrationRow{}
	}

	return patients, total, rows.Err()
}

// BuildPatientRegistrationCSV generates a CSV export of patient registrations filtered by date range.
func (r *Repository) BuildPatientRegistrationCSV(dateFrom, dateTo string) ([]byte, error) {
	// Get all matching records (capped at 10,000)
	rows, _, err := r.GetPatientRegistrations(dateFrom, dateTo, 1, 10000)
>>>>>>> 33e02a6ba13837992b0e91598f1ab5684fd09915
	if err != nil {
		return nil, err
	}

	var buf []byte
<<<<<<< HEAD
	buf = append(buf, 0xEF, 0xBB, 0xBF) // UTF-8 BOM
	header := "Patient ID,Name,Email,Phone,Gender,DOB,Blood Group,Genotype,Height (cm),Weight (kg),BMI,Test Results,Registered At\n"
	buf = append(buf, []byte(header)...)
	for _, p := range patients {
		bmi := ""
		if p.BMI > 0 {
			bmi = strconv.FormatFloat(p.BMI, 'f', 1, 64)
		}
		height := ""
		if p.HeightCM > 0 {
			height = strconv.FormatFloat(p.HeightCM, 'f', 1, 64)
		}
		weight := ""
		if p.WeightKG > 0 {
			weight = strconv.FormatFloat(p.WeightKG, 'f', 1, 64)
		}
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
			csvEscape(p.PatientID), csvEscape(p.Name), csvEscape(p.Email), csvEscape(p.Phone),
			csvEscape(p.Gender), csvEscape(p.DOB), csvEscape(p.BloodGroup), csvEscape(p.Genotype),
			csvEscape(height), csvEscape(weight), csvEscape(bmi),
			csvEscape(p.TestResults), csvEscape(p.CreatedAt))
		buf = append(buf, []byte(line)...)
	}
	return buf, nil
}

// ─── Import ────────────────────────────────────────────────────────────────────

// UpdatePatientFromCSVRow updates a single patient's clinical fields (blood
// group, genotype, height/weight for BMI, and any other test-result columns)
// matched by email. Recognized columns map to dedicated users columns; any
// other column is merged into the JSONB test_results field (existing keys are
// preserved unless overwritten by the same key). Returns an error if no
// patient with that email exists.
func (r *Repository) UpdatePatientFromCSVRow(email string, fields map[string]string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("email is required")
	}

	var userID string
	err := r.db.QueryRow(`SELECT id::text FROM users WHERE email = $1 AND role = 'user'`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("no patient found with email %s", email)
	}
	if err != nil {
		return err
	}

	setClauses := []string{}
	args := []interface{}{}
	n := 1
	extra := map[string]string{}

	for header, value := range fields {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := normalizeHeader(header)
		if key == "email" {
			continue
		}
		if col, ok := recognizedPatientColumns[key]; ok {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, value)
			n++
			continue
		}
		// Anything unrecognized is treated as a lab/test result field.
		extra[header] = value
	}

	if len(extra) > 0 {
		extraJSON, err := json.Marshal(extra)
		if err != nil {
			return err
		}
		setClauses = append(setClauses, fmt.Sprintf("test_results = test_results || $%d::jsonb", n))
		args = append(args, string(extraJSON))
		n++
	}

	if len(setClauses) == 0 {
		return fmt.Errorf("no recognized fields to update")
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, userID)
	query := fmt.Sprintf(`UPDATE users SET %s WHERE id = $%d::uuid`, strings.Join(setClauses, ", "), n)
	_, err = r.db.Exec(query, args...)
	return err
=======
	// UTF-8 BOM for Excel compatibility
	buf = append(buf, 0xEF, 0xBB, 0xBF)

	header := "ID,Name,Email,Phone,DOB,Gender,Blood Type,Genotype,BMI,Language,Country,State,Registration Date,Last Activity Date\n"
	buf = append(buf, []byte(header)...)

	for _, p := range rows {
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
			csvEscape(p.ID),
			csvEscape(p.Name),
			csvEscape(p.Email),
			csvEscape(p.Phone),
			csvEscape(p.DOB),
			csvEscape(p.Gender),
			csvEscape(p.BloodType),
			csvEscape(p.Genotype),
			csvEscape(p.BMI),
			csvEscape(p.Language),
			csvEscape(p.Country),
			csvEscape(p.State),
			csvEscape(p.RegistrationDate),
			csvEscape(p.LastActivityDate),
		)
		buf = append(buf, []byte(line)...)
	}

	return buf, nil
}

// ─── Patient Health Data CSV Import ─────────────────────────────────────────

// PatientHealthImportRow represents a single row from an import CSV.
type PatientHealthImportRow struct {
	PatientID string // email or user ID
	BloodType string
	Genotype  string
	BMI       string
	TestResults map[string]interface{}
	RawRow    []string
}

// ParsePatientHealthCSV parses a CSV file for bulk health data updates.
// Expected headers: PatientID, BloodType, Genotype, BMI, [additional test result columns]
// PatientID can be a user ID (UUID) or email address.
func ParsePatientHealthCSV(csvData []byte) ([]PatientHealthImportRow, error) {
	reader := csv.NewReader(string(csvData))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV: %w", err)
	}

	if len(records) == 0 {
		return nil, fmt.Errorf("CSV is empty")
	}

	// Parse header
	header := records[0]
	headerMap := make(map[string]int)
	requiredHeaders := []string{"PatientID", "BloodType", "Genotype", "BMI"}

	for i, h := range header {
		headerMap[h] = i
	}

	// Validate required headers exist
	for _, reqHeader := range requiredHeaders {
		if _, ok := headerMap[reqHeader]; !ok {
			return nil, fmt.Errorf("missing required header: %s", reqHeader)
		}
	}

	var rows []PatientHealthImportRow
	for i := 1; i < len(records); i++ {
		record := records[i]

		// Skip empty rows
		if len(record) == 0 || (len(record) == 1 && record[0] == "") {
			continue
		}

		// Validate row length
		if len(record) < len(header) {
			// Pad with empty strings
			for len(record) < len(header) {
				record = append(record, "")
			}
		}

		row := PatientHealthImportRow{
			PatientID:   record[headerMap["PatientID"]],
			BloodType:   record[headerMap["BloodType"]],
			Genotype:    record[headerMap["Genotype"]],
			BMI:         record[headerMap["BMI"]],
			TestResults: make(map[string]interface{}),
			RawRow:      record,
		}

		// Skip if PatientID is empty
		if row.PatientID == "" {
			continue
		}

		// Collect additional test result columns
		for colName, colIndex := range headerMap {
			if colName != "PatientID" && colName != "BloodType" && colName != "Genotype" && colName != "BMI" {
				if colIndex < len(record) {
					row.TestResults[colName] = record[colIndex]
				}
			}
		}

		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return nil, fmt.Errorf("CSV contains no valid data rows")
	}

	return rows, nil
}

// UpdatePatientHealthData updates patient health data from import rows.
// Returns the number of successful updates and any errors encountered.
// Continues processing even if individual rows fail.
func (r *Repository) UpdatePatientHealthData(rows []PatientHealthImportRow, adminID string) (int, []string, error) {
	var successCount int
	var errors []string

	for i, row := range rows {
		// Resolve patient by ID or email
		var patientID string
		err := r.db.QueryRow(`
			SELECT id::text FROM users
			WHERE (id::text = $1 OR email = $1) AND role IN ('user', 'patient')
		`, row.PatientID).Scan(&patientID)

		if err == sql.ErrNoRows {
			errors = append(errors, fmt.Sprintf("Row %d: Patient not found: %s", i+2, row.PatientID))
			continue
		} else if err != nil {
			errors = append(errors, fmt.Sprintf("Row %d: Database error: %v", i+2, err))
			continue
		}

		// Build dynamic UPDATE query
		updateQuery := `UPDATE users SET updated_at = NOW()`
		args := []interface{}{}
		argN := 1

		if row.BloodType != "" {
			updateQuery += fmt.Sprintf(`, blood_type = $%d`, argN)
			args = append(args, row.BloodType)
			argN++
		}

		if row.Genotype != "" {
			updateQuery += fmt.Sprintf(`, genotype = $%d`, argN)
			args = append(args, row.Genotype)
			argN++
		}

		if row.BMI != "" {
			updateQuery += fmt.Sprintf(`, bmi = $%d`, argN)
			args = append(args, row.BMI)
			argN++
		}

		// Add WHERE clause
		updateQuery += fmt.Sprintf(` WHERE id = $%d::uuid`, argN)
		args = append(args, patientID)

		// Execute update
		_, err = r.db.Exec(updateQuery, args...)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Row %d: Update failed: %v", i+2, err))
			continue
		}

		successCount++

		// Log the import action in audit
		r.LogAction(adminID, "patient.health_data_update", "user", &patientID, map[string]interface{}{
			"bloodType": row.BloodType,
			"genotype":  row.Genotype,
			"bmi":       row.BMI,
		})
	}

	return successCount, errors, nil
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// csv reader should use the "encoding/csv" package built-in reader
// This is a simple wrapper for manual CSV parsing from bytes
func csvReader(data []byte) *csv.Reader {
	return csv.NewReader(string(data))
>>>>>>> 33e02a6ba13837992b0e91598f1ab5684fd09915
}
