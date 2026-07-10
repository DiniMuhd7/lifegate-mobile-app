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
	if err != nil {
		return nil, err
	}

	var buf []byte
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
}
