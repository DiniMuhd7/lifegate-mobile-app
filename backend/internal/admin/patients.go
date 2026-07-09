package admin

import (
	"database/sql"
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
	if err != nil {
		return nil, err
	}

	var buf []byte
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
}
