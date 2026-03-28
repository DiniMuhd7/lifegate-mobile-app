package review

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

type AnalysisRow struct {
	Date            string `json:"date"`
	TotalDiagnoses  int    `json:"totalDiagnoses"`
	LowUrgency      int    `json:"lowUrgency"`
	MediumUrgency   int    `json:"mediumUrgency"`
	HighUrgency     int    `json:"highUrgency"`
	CriticalUrgency int    `json:"criticalUrgency"`
	Completed       int    `json:"completed"`
	Pending         int    `json:"pending"`
}

type DiagnosisRecord struct {
	ID          string `json:"id"`
	PatientID   string `json:"patientId"`
	PatientName string `json:"patientName"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Condition   string `json:"condition"`
	Urgency     string `json:"urgency"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
}

type ActivityRecord struct {
	ID        string `json:"id"`
	PatientID string `json:"patientId"`
	CaseType  string `json:"caseType"`
	Condition string `json:"condition"`
	Timestamp string `json:"timestamp"`
	TimeAgo   string `json:"timeAgo"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) GetAnalysis(physicianID string, startDate, endDate time.Time) ([]AnalysisRow, error) {
	rows, err := s.db.Query(
		`SELECT
			DATE(created_at)::TEXT AS date,
			COUNT(*) AS total,
			SUM(CASE WHEN urgency='LOW' THEN 1 ELSE 0 END) AS low,
			SUM(CASE WHEN urgency='MEDIUM' THEN 1 ELSE 0 END) AS medium,
			SUM(CASE WHEN urgency='HIGH' THEN 1 ELSE 0 END) AS high,
			SUM(CASE WHEN urgency='CRITICAL' THEN 1 ELSE 0 END) AS critical,
			SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
			SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending
		 FROM diagnoses
		 WHERE (physician_id = $1 OR physician_id IS NULL)
		   AND created_at >= $2 AND created_at <= $3
		 GROUP BY DATE(created_at)
		 ORDER BY date`, physicianID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []AnalysisRow
	for rows.Next() {
		var r AnalysisRow
		if err := rows.Scan(&r.Date, &r.TotalDiagnoses, &r.LowUrgency, &r.MediumUrgency, &r.HighUrgency, &r.CriticalUrgency, &r.Completed, &r.Pending); err != nil {
			log.Printf("review: scan analysis row: %v", err)
			continue
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func (s *Service) GetDiagnoses(physicianID, status, search string, page, pageSize int, start, end time.Time) ([]DiagnosisRecord, int, error) {
	offset := (page - 1) * pageSize
	conditions := []string{"(d.physician_id = $1 OR d.physician_id IS NULL)"}
	args := []interface{}{physicianID}
	argIdx := 2

	if !start.IsZero() && !end.IsZero() {
		conditions = append(conditions, fmt.Sprintf("d.created_at >= $%d AND d.created_at <= $%d", argIdx, argIdx+1))
		args = append(args, start, end)
		argIdx += 2
	}

	if status != "" && status != "All" {
		conditions = append(conditions, fmt.Sprintf("d.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf("(u.name ILIKE $%d OR d.condition ILIKE $%d OR d.title ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")
	query := fmt.Sprintf(`
		SELECT d.id,
		       COALESCE(u.patient_id, u.user_id, d.user_id::text) AS patient_id,
		       COALESCE(u.name, '') AS patient_name,
		       COALESCE(d.title, '') AS title,
		       COALESCE(d.description, '') AS description,
		       COALESCE(d.condition, '') AS condition,
		       COALESCE(d.urgency, '') AS urgency,
		       d.status,
		       d.created_at::text AS created_at
		FROM diagnoses d
		LEFT JOIN users u ON u.id = d.user_id
		%s
		ORDER BY d.created_at DESC
		LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)
	args = append(args, pageSize, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []DiagnosisRecord
	for rows.Next() {
		var r DiagnosisRecord
		if err := rows.Scan(&r.ID, &r.PatientID, &r.PatientName, &r.Title, &r.Description, &r.Condition, &r.Urgency, &r.Status, &r.CreatedAt); err != nil {
			log.Printf("review: scan diagnosis row: %v", err)
			continue
		}
		records = append(records, r)
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM diagnoses d LEFT JOIN users u ON u.id = d.user_id %s`, where)
	countArgs := args[:len(args)-2]
	var total int
	if err := s.db.QueryRow(countQuery, countArgs...).Scan(&total); err != nil {
		log.Printf("review: count diagnoses: %v", err)
	}

	return records, total, rows.Err()
}

func (s *Service) GetDiagnosisDetail(physicianID, diagnosisID string) (*DiagnosisRecord, error) {
	var r DiagnosisRecord
	err := s.db.QueryRow(`
		SELECT d.id,
		       COALESCE(u.patient_id, u.user_id, d.user_id::text) AS patient_id,
		       COALESCE(u.name, '') AS patient_name,
		       COALESCE(d.title, '') AS title,
		       COALESCE(d.description, '') AS description,
		       COALESCE(d.condition, '') AS condition,
		       COALESCE(d.urgency, '') AS urgency,
		       d.status,
		       d.created_at::text AS created_at
		FROM diagnoses d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE d.id = $1 AND (d.physician_id = $2 OR d.physician_id IS NULL)`,
		diagnosisID, physicianID,
	).Scan(&r.ID, &r.PatientID, &r.PatientName, &r.Title, &r.Description, &r.Condition, &r.Urgency, &r.Status, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &r, err
}

func (s *Service) GetRecentActivities(physicianID string, limit int) ([]ActivityRecord, error) {
	rows, err := s.db.Query(`
		SELECT d.id,
		       COALESCE(u.patient_id, u.user_id, d.user_id::text),
		       d.status,
		       COALESCE(d.condition, ''),
		       d.updated_at
		FROM diagnoses d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE (d.physician_id = $1 OR d.physician_id IS NULL)
		  AND d.status IN ('Completed', 'Pending', 'Active')
		ORDER BY d.updated_at DESC
		LIMIT $2`, physicianID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now()
	var activities []ActivityRecord
	for rows.Next() {
		var a ActivityRecord
		var status string
		var updatedAt time.Time
		if err := rows.Scan(&a.ID, &a.PatientID, &status, &a.Condition, &updatedAt); err != nil {
			log.Printf("review: scan activity row: %v", err)
			continue
		}
		switch status {
		case "Completed":
			a.CaseType = "Verified"
		case "Active":
			a.CaseType = "Escalated"
		default:
			a.CaseType = "Pending"
		}
		a.Timestamp = updatedAt.Format(time.RFC3339)
		a.TimeAgo = timeAgo(now, updatedAt)
		activities = append(activities, a)
	}
	return activities, rows.Err()
}

func timeAgo(now, t time.Time) string {
	diff := now.Sub(t)
	switch {
	case diff < time.Minute:
		return "Just now"
	case diff < time.Hour:
		mins := int(diff.Minutes())
		if mins == 1 {
			return "1 min ago"
		}
		return fmt.Sprintf("%d mins ago", mins)
	case diff < 24*time.Hour:
		hrs := int(diff.Hours())
		if hrs == 1 {
			return "1 hr ago"
		}
		return fmt.Sprintf("%d hrs ago", hrs)
	default:
		days := int(diff.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
}
