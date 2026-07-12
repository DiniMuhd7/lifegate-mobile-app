package admin

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

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
	TestResults string  `json:"testResults"`
	CreatedAt   string  `json:"createdAt"`
}

type PatientImportRowResult struct {
	Row     int    `json:"row"`
	Email   string `json:"email"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type PatientImportSummary struct {
	TotalRows int                      `json:"totalRows"`
	Updated   int                      `json:"updated"`
	Failed    int                      `json:"failed"`
	Results   []PatientImportRowResult `json:"results"`
}

var recognizedPatientColumns = map[string]string{
	"bloodgroup": "blood_type",
	"bloodtype":  "blood_type",
	"genotype":   "genotype",
	"bmi":        "bmi",
	"heightcm":   "height_cm",
	"height":     "height_cm",
	"weightkg":   "weight_kg",
	"weight":     "weight_kg",
}

func normalizeHeader(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	return strings.NewReplacer(" ", "", "_", "", "-", "").Replace(h)
}

func (r *Repository) GetPatientsForExport(dateFrom, dateTo string) ([]PatientRow, error) {
	rows, err := r.db.Query(`
		SELECT id::text, COALESCE(patient_id,''), name, email, COALESCE(phone,''),
		       COALESCE(gender,''), COALESCE(dob,''), COALESCE(blood_type,''),
		       COALESCE(genotype,''), COALESCE(height_cm,0), COALESCE(weight_kg,0),
		       COALESCE(test_results::text, '{}'), created_at::text
		FROM users
		WHERE role IN ('user', 'patient')
		  AND created_at::date >= $1::date
		  AND created_at::date <= $2::date
		ORDER BY created_at ASC`, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PatientRow{}
	for rows.Next() {
		var p PatientRow
		if err := rows.Scan(&p.ID, &p.PatientID, &p.Name, &p.Email, &p.Phone, &p.Gender, &p.DOB, &p.BloodGroup, &p.Genotype, &p.HeightCM, &p.WeightKG, &p.TestResults, &p.CreatedAt); err != nil {
			return nil, err
		}
		if p.HeightCM > 0 && p.WeightKG > 0 {
			heightM := p.HeightCM / 100
			p.BMI = p.WeightKG / (heightM * heightM)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) BuildPatientsCSV(dateFrom, dateTo string) ([]byte, error) {
	patients, err := r.GetPatientsForExport(dateFrom, dateTo)
	if err != nil {
		return nil, err
	}

	buf := []byte{0xEF, 0xBB, 0xBF}
	buf = append(buf, []byte("Patient ID,Name,Email,Phone,Gender,DOB,Blood Group,Genotype,Height (cm),Weight (kg),BMI,Test Results,Registered At\n")...)
	for _, p := range patients {
		bmi, height, weight := "", "", ""
		if p.BMI > 0 {
			bmi = strconv.FormatFloat(p.BMI, 'f', 1, 64)
		}
		if p.HeightCM > 0 {
			height = strconv.FormatFloat(p.HeightCM, 'f', 1, 64)
		}
		if p.WeightKG > 0 {
			weight = strconv.FormatFloat(p.WeightKG, 'f', 1, 64)
		}
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", csvEscape(p.PatientID), csvEscape(p.Name), csvEscape(p.Email), csvEscape(p.Phone), csvEscape(p.Gender), csvEscape(p.DOB), csvEscape(p.BloodGroup), csvEscape(p.Genotype), csvEscape(height), csvEscape(weight), csvEscape(bmi), csvEscape(p.TestResults), csvEscape(p.CreatedAt))
		buf = append(buf, []byte(line)...)
	}
	return buf, nil
}

// PatientRegistrationRow represents a single patient registration record for export.
type PatientRegistrationRow struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Email            string `json:"email"`
	Phone            string `json:"phone"`
	DOB              string `json:"dob"`
	Gender           string `json:"gender"`
	BloodType        string `json:"bloodType"`
	Genotype         string `json:"genotype"`
	BMI              string `json:"bmi"`
	Language         string `json:"language"`
	Country          string `json:"country"`
	State            string `json:"state"`
	RegistrationDate string `json:"registrationDate"`
	LastActivityDate string `json:"lastActivityDate"`
}

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
		where += fmt.Sprintf(" AND u.created_at < $%d::date + INTERVAL '1 day'", n)
		args = append(args, dateTo)
		n++
	}

	var total int
	if err := r.db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM users u %s`, where), args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limitArgs := append(args, pageSize, offset)
	rows, err := r.db.Query(fmt.Sprintf(`
		SELECT u.id::text, COALESCE(u.name, ''), COALESCE(u.email, ''), COALESCE(u.phone, ''),
		       COALESCE(u.dob, ''), COALESCE(u.gender, ''), COALESCE(u.blood_type, ''),
		       COALESCE(u.genotype, ''), COALESCE(u.bmi::text, ''), COALESCE(u.language, ''),
		       COALESCE(u.country, ''), COALESCE(u.state, ''), u.created_at::text,
		       COALESCE(u.updated_at::text, u.created_at::text)
		FROM users u %s ORDER BY u.created_at DESC LIMIT $%d OFFSET $%d`, where, n, n+1), limitArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	patients := []PatientRegistrationRow{}
	for rows.Next() {
		var p PatientRegistrationRow
		if err := rows.Scan(&p.ID, &p.Name, &p.Email, &p.Phone, &p.DOB, &p.Gender, &p.BloodType, &p.Genotype, &p.BMI, &p.Language, &p.Country, &p.State, &p.RegistrationDate, &p.LastActivityDate); err != nil {
			return nil, 0, err
		}
		patients = append(patients, p)
	}
	return patients, total, rows.Err()
}

func (r *Repository) BuildPatientRegistrationCSV(dateFrom, dateTo string) ([]byte, error) {
	rows, _, err := r.GetPatientRegistrations(dateFrom, dateTo, 1, 10000)
	if err != nil {
		return nil, err
	}
	buf := []byte{0xEF, 0xBB, 0xBF}
	buf = append(buf, []byte("ID,Name,Email,Phone,DOB,Gender,Blood Type,Genotype,BMI,Language,Country,State,Registration Date,Last Activity Date\n")...)
	for _, p := range rows {
		line := fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", csvEscape(p.ID), csvEscape(p.Name), csvEscape(p.Email), csvEscape(p.Phone), csvEscape(p.DOB), csvEscape(p.Gender), csvEscape(p.BloodType), csvEscape(p.Genotype), csvEscape(p.BMI), csvEscape(p.Language), csvEscape(p.Country), csvEscape(p.State), csvEscape(p.RegistrationDate), csvEscape(p.LastActivityDate))
		buf = append(buf, []byte(line)...)
	}
	return buf, nil
}

func (r *Repository) UpdatePatientFromCSVRow(email string, fields map[string]string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("email is required")
	}
	var userID string
	err := r.db.QueryRow(`SELECT id::text FROM users WHERE email = $1 AND role IN ('user', 'patient')`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("no patient found with email %s", email)
	}
	if err != nil {
		return err
	}

	setClauses, args, extra, n := []string{}, []interface{}{}, map[string]string{}, 1
	for header, value := range fields {
		value = strings.TrimSpace(value)
		if value == "" || normalizeHeader(header) == "email" {
			continue
		}
		if col, ok := recognizedPatientColumns[normalizeHeader(header)]; ok {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, value)
			n++
			continue
		}
		extra[header] = value
	}
	if len(extra) > 0 {
		extraJSON, err := json.Marshal(extra)
		if err != nil {
			return err
		}
		setClauses = append(setClauses, fmt.Sprintf("test_results = COALESCE(test_results, '{}'::jsonb) || $%d::jsonb", n))
		args = append(args, string(extraJSON))
		n++
	}
	if len(setClauses) == 0 {
		return fmt.Errorf("no recognized fields to update")
	}
	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, userID)
	_, err = r.db.Exec(fmt.Sprintf(`UPDATE users SET %s WHERE id = $%d::uuid`, strings.Join(setClauses, ", "), n), args...)
	return err
}

type PatientHealthImportRow struct {
	PatientID   string
	BloodType   string
	Genotype    string
	BMI         string
	TestResults map[string]interface{}
	RawRow      []string
}

func ParsePatientHealthCSV(csvData []byte) ([]PatientHealthImportRow, error) {
	reader := csv.NewReader(bytes.NewReader(csvData))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("CSV is empty")
	}
	headerMap := make(map[string]int)
	for i, h := range records[0] {
		headerMap[strings.TrimSpace(h)] = i
	}
	for _, h := range []string{"PatientID", "BloodType", "Genotype", "BMI"} {
		if _, ok := headerMap[h]; !ok {
			return nil, fmt.Errorf("missing required header: %s", h)
		}
	}
	rows := []PatientHealthImportRow{}
	for i := 1; i < len(records); i++ {
		record := records[i]
		for len(record) < len(records[0]) {
			record = append(record, "")
		}
		row := PatientHealthImportRow{PatientID: record[headerMap["PatientID"]], BloodType: record[headerMap["BloodType"]], Genotype: record[headerMap["Genotype"]], BMI: record[headerMap["BMI"]], TestResults: map[string]interface{}{}, RawRow: record}
		if strings.TrimSpace(row.PatientID) == "" {
			continue
		}
		for colName, colIndex := range headerMap {
			if colName != "PatientID" && colName != "BloodType" && colName != "Genotype" && colName != "BMI" && colIndex < len(record) {
				row.TestResults[colName] = record[colIndex]
			}
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("CSV contains no valid data rows")
	}
	return rows, nil
}

func (r *Repository) UpdatePatientHealthData(rows []PatientHealthImportRow, adminID string) (int, []string, error) {
	successCount := 0
	importErrors := []string{}
	for i, row := range rows {
		fields := map[string]string{"blood_type": row.BloodType, "genotype": row.Genotype, "bmi": row.BMI}
		for k, v := range row.TestResults {
			fields[k] = fmt.Sprint(v)
		}
		if err := r.UpdatePatientFromCSVRow(row.PatientID, fields); err != nil {
			importErrors = append(importErrors, fmt.Sprintf("Row %d: %v", i+2, err))
			continue
		}
		successCount++
		r.LogAction(adminID, "patient.health_data_update", "user", nil, map[string]interface{}{"patientID": row.PatientID})
	}
	return successCount, importErrors, nil
}

func (r *Repository) GetPatientHealth(patientID string) (map[string]interface{}, error) {
	var raw string
	health := map[string]interface{}{}
	err := r.db.QueryRow(`SELECT COALESCE(test_results::text, '{}') FROM users WHERE id::text = $1 AND role IN ('user', 'patient')`, patientID).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("not found")
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(raw), &health); err != nil {
		health["testResults"] = raw
	}
	return health, nil
}

func (r *Repository) UpdatePatientHealthDirect(patientID string, data map[string]interface{}, adminID string) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	res, err := r.db.Exec(`UPDATE users SET test_results = COALESCE(test_results, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id::text = $2 AND role IN ('user', 'patient')`, string(payload), patientID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("not found")
	}
	r.LogAction(adminID, "patient.health_data_update", "user", &patientID, data)
	return nil
}
