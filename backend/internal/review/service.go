package review

import (
"database/sql"
"time"
)

type AnalysisRow struct {
Date           string `json:"date"`
TotalDiagnoses int    `json:"totalDiagnoses"`
LowUrgency     int    `json:"lowUrgency"`
MediumUrgency  int    `json:"mediumUrgency"`
HighUrgency    int    `json:"highUrgency"`
CriticalUrgency int   `json:"criticalUrgency"`
Completed      int    `json:"completed"`
Pending        int    `json:"pending"`
}

type Service struct {
db *sql.DB
}

func NewService(db *sql.DB) *Service {
return &Service{db: db}
}

func (s *Service) GetAnalysis(startDate, endDate time.Time) ([]AnalysisRow, error) {
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
 WHERE created_at >= $1 AND created_at <= $2
 GROUP BY DATE(created_at)
 ORDER BY date`, startDate, endDate)
if err != nil {
return nil, err
}
defer rows.Close()

var results []AnalysisRow
for rows.Next() {
var r AnalysisRow
if err := rows.Scan(&r.Date, &r.TotalDiagnoses, &r.LowUrgency, &r.MediumUrgency, &r.HighUrgency, &r.CriticalUrgency, &r.Completed, &r.Pending); err != nil {
continue
}
results = append(results, r)
}
return results, rows.Err()
}
