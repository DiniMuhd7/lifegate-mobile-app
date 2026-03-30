package physician

import (
"database/sql"
"log"
"time"
)

type Report struct {
ID             string         `json:"id"`
UserID         string         `json:"user_id"`
PhysicianID    sql.NullString `json:"-"`
Title          sql.NullString `json:"-"`
Description    sql.NullString `json:"-"`
Condition      sql.NullString `json:"-"`
Urgency        sql.NullString `json:"-"`
PhysicianNotes sql.NullString `json:"-"`
Status         string         `json:"status"`
PatientName    sql.NullString `json:"-"`
CreatedAt      time.Time      `json:"created_at"`
UpdatedAt      time.Time      `json:"updated_at"`
// Exported flattened fields for JSON response
TitleStr          string `json:"title,omitempty"`
DescriptionStr    string `json:"description,omitempty"`
ConditionStr      string `json:"condition,omitempty"`
UrgencyStr        string `json:"urgency,omitempty"`
PhysicianNotesStr string `json:"physician_notes,omitempty"`
PatientNameStr    string `json:"patient_name,omitempty"`
}

type Stats struct {
TotalReports    int `json:"totalReports"`
PendingCount    int `json:"pendingCount"`
ActiveCount     int `json:"activeCount"`
CompletedCount  int `json:"completedCount"`
}

type Repository struct {
db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
return &Repository{db: db}
}

func (r *Repository) GetReports(physicianID string, page, pageSize int) ([]Report, int, error) {
offset := (page - 1) * pageSize
rows, err := r.db.Query(
`SELECT d.id, d.user_id, d.physician_id, d.title, d.description, d.condition, d.urgency,
        d.physician_notes, d.status, u.name, d.created_at, d.updated_at
 FROM diagnoses d
 LEFT JOIN users u ON u.id = d.user_id
 WHERE d.physician_id = $1 OR d.physician_id IS NULL
 ORDER BY d.created_at DESC
 LIMIT $2 OFFSET $3`, physicianID, pageSize, offset)
if err != nil {
return nil, 0, err
}
defer rows.Close()

var reports []Report
for rows.Next() {
var rpt Report
if err := rows.Scan(
&rpt.ID, &rpt.UserID, &rpt.PhysicianID, &rpt.Title, &rpt.Description,
&rpt.Condition, &rpt.Urgency, &rpt.PhysicianNotes, &rpt.Status,
&rpt.PatientName, &rpt.CreatedAt, &rpt.UpdatedAt,
); err != nil {
log.Printf("physician: scan report row: %v", err)
continue
}
rpt.TitleStr = rpt.Title.String
rpt.DescriptionStr = rpt.Description.String
rpt.ConditionStr = rpt.Condition.String
rpt.UrgencyStr = rpt.Urgency.String
rpt.PhysicianNotesStr = rpt.PhysicianNotes.String
rpt.PatientNameStr = rpt.PatientName.String
reports = append(reports, rpt)
}

var total int
_ = r.db.QueryRow(`SELECT COUNT(*) FROM diagnoses WHERE physician_id=$1 OR physician_id IS NULL`, physicianID).Scan(&total)

return reports, total, rows.Err()
}

func (r *Repository) GetStats(physicianID string) (*Stats, error) {
stats := &Stats{}
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE physician_id=$1 OR physician_id IS NULL`, physicianID).Scan(&stats.TotalReports)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Pending'`, physicianID).Scan(&stats.PendingCount)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Active'`, physicianID).Scan(&stats.ActiveCount)
_ = r.db.QueryRow(
`SELECT COUNT(*) FROM diagnoses WHERE (physician_id=$1 OR physician_id IS NULL) AND status='Completed'`, physicianID).Scan(&stats.CompletedCount)
return stats, nil
}

// ReviewReport updates the diagnosis and returns the owning patient's user_id so
// the caller can push a real-time WebSocket event to that patient.
func (r *Repository) ReviewReport(reportID, physicianID, action, notes string) (patientID string, err error) {
err = r.db.QueryRow(
`UPDATE diagnoses SET physician_id=$1, physician_notes=$2, status=$3, updated_at=NOW()
 WHERE id=$4
 RETURNING user_id::text`,
physicianID, notes, action, reportID,
).Scan(&patientID)
return patientID, err
}
