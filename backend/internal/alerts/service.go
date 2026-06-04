package alerts

import (
	"database/sql"
	"time"
)

// Alert categories
const (
	CategoryFollowUp   = "follow_up"
	CategoryRecurring  = "recurring"
	CategoryMedication = "medication"
	CategoryUrgent     = "urgent"
	CategoryPreventive = "preventive"
)

// Alert severities
const (
	SeverityLow      = "LOW"
	SeverityMedium   = "MEDIUM"
	SeverityHigh     = "HIGH"
	SeverityCritical = "CRITICAL"
)

// Alert is a single computed preventive alert for a patient.
type Alert struct {
	ID          string `json:"id"`
	DiagnosisID string `json:"diagnosisId,omitempty"`
	Category    string `json:"category"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Message     string `json:"message"`
	// ScheduledFor is the ISO-8601 string of when the action is due (empty = now).
	ScheduledFor string `json:"scheduledFor,omitempty"`
	IsRead       bool   `json:"isRead"`
	CreatedAt    string `json:"createdAt"`
}

// rawDiagnosis is the minimal shape read from the DB to generate alerts.
type rawDiagnosis struct {
	id          string
	condition   string
	urgency     string
	status      string
	escalated   bool
	hasPrescription bool
	createdAt   time.Time
	updatedAt   time.Time
}

// Service computes preventive alerts for patients from their diagnosis history.
type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetAlertsForPatient derives preventive alerts from the patient's diagnosis history.
// Alerts are computed on-the-fly — no separate storage needed.
func (s *Service) GetAlertsForPatient(userID string) ([]Alert, error) {
	rows, err := s.db.Query(`
		SELECT d.id,
		       COALESCE(d.condition,''),
		       COALESCE(d.urgency,'LOW'),
		       d.status,
		       d.escalated,
		       (d.ai_response IS NOT NULL AND d.ai_response->>'prescription' IS NOT NULL
		        AND d.ai_response->>'prescription' != 'null') AS has_prescription,
		       d.created_at,
		       d.updated_at
		FROM diagnoses d
		WHERE d.user_id = $1::uuid
		ORDER BY d.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var diags []rawDiagnosis
	for rows.Next() {
		var d rawDiagnosis
		if err := rows.Scan(&d.id, &d.condition, &d.urgency, &d.status,
			&d.escalated, &d.hasPrescription, &d.createdAt, &d.updatedAt); err != nil {
			continue
		}
		diags = append(diags, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return computeAlerts(diags), nil
}

// GetAlertsForPhysician returns escalated or pending cases that need attention.
func (s *Service) GetAlertsForPhysician(physicianID string) ([]Alert, error) {
	rows, err := s.db.Query(`
		SELECT d.id,
		       COALESCE(d.condition,''),
		       COALESCE(d.urgency,'LOW'),
		       d.status,
		       d.escalated,
		       d.created_at
		FROM diagnoses d
		WHERE d.escalated = true
		  AND d.status IN ('Pending','Active')
		ORDER BY
		  CASE d.urgency
		    WHEN 'CRITICAL' THEN 1
		    WHEN 'HIGH'     THEN 2
		    WHEN 'MEDIUM'   THEN 3
		    ELSE                 4
		  END,
		  d.created_at ASC
		LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Alert
	now := time.Now().UTC()
	idx := 0
	for rows.Next() {
		var id, condition, urgency, status string
		var escalated bool
		var createdAt time.Time
		if err := rows.Scan(&id, &condition, &urgency, &status, &escalated, &createdAt); err != nil {
			continue
		}
		hoursOpen := now.Sub(createdAt).Hours()
		title := "Escalated case needs review"
		msg := condition + " — escalated and awaiting physician action"
		sev := SeverityHigh
		if urgency == "CRITICAL" {
			sev = SeverityCritical
			title = "CRITICAL: Immediate review required"
		} else if hoursOpen > 48 {
			sev = SeverityCritical
			title = "Overdue: Escalated case pending > 48 h"
		}
		idx++
		out = append(out, Alert{
			ID:          id + "-phy-alert",
			DiagnosisID: id,
			Category:    CategoryUrgent,
			Severity:    sev,
			Title:       title,
			Message:     msg,
			IsRead:      false,
			CreatedAt:   createdAt.Format(time.RFC3339),
		})
	}
	return out, rows.Err()
}

// computeAlerts applies all alert rules to the loaded diagnosis list.
func computeAlerts(diags []rawDiagnosis) []Alert {
	now := time.Now().UTC()
	var alerts []Alert
	seqID := 0

	nextID := func(diagID string, suffix string) string {
		seqID++
		return diagID + "-" + suffix
	}

	// --- Rule 1: Follow-up after HIGH/CRITICAL completed cases older than 30 d ---
	for _, d := range diags {
		if d.status == "Completed" &&
			(d.urgency == "HIGH" || d.urgency == "CRITICAL") &&
			now.Sub(d.createdAt) > 30*24*time.Hour {
			due := d.createdAt.Add(30 * 24 * time.Hour)
			alerts = append(alerts, Alert{
				ID:           nextID(d.id, "followup"),
				DiagnosisID:  d.id,
				Category:     CategoryFollowUp,
				Severity:     SeverityMedium,
				Title:        "Follow-up recommended",
				Message:      "Your " + d.condition + " case was completed. A follow-up check-up is recommended.",
				ScheduledFor: due.Format(time.RFC3339),
				IsRead:       false,
				CreatedAt:    now.Format(time.RFC3339),
			})
		}
	}

	// --- Rule 2: Recurring condition (same condition ≥ 2 times in 90 d) ---
	conditionDates := map[string][]time.Time{}
	for _, d := range diags {
		if now.Sub(d.createdAt) <= 90*24*time.Hour {
			conditionDates[d.condition] = append(conditionDates[d.condition], d.createdAt)
		}
	}
	for cond, dates := range conditionDates {
		if cond == "" || len(dates) < 2 {
			continue
		}
		// Use oldest matching diagnosis as anchor
		anchorID := ""
		for _, d := range diags {
			if d.condition == cond {
				anchorID = d.id
				break
			}
		}
		alerts = append(alerts, Alert{
			ID:          nextID(anchorID, "recurring"),
			DiagnosisID: anchorID,
			Category:    CategoryRecurring,
			Severity:    SeverityHigh,
			Title:       "Recurring condition detected",
			Message:     cond + " has appeared " + itoa(len(dates)) + " times in the last 90 days. Please consult a physician.",
			IsRead:      false,
			CreatedAt:   now.Format(time.RFC3339),
		})
	}

	// --- Rule 3: Medication check after 14 d ---
	for _, d := range diags {
		if d.hasPrescription &&
			d.status != "Completed" &&
			now.Sub(d.createdAt) >= 14*24*time.Hour &&
			now.Sub(d.createdAt) < 30*24*time.Hour {
			alerts = append(alerts, Alert{
				ID:          nextID(d.id, "med"),
				DiagnosisID: d.id,
				Category:    CategoryMedication,
				Severity:    SeverityLow,
				Title:       "Medication check reminder",
				Message:     "You have been on medication for " + d.condition + " for 14+ days. Check in with your physician.",
				IsRead:      false,
				CreatedAt:   now.Format(time.RFC3339),
			})
		}
	}

	// --- Rule 4: Escalated case still Pending after 48 h ---
	for _, d := range diags {
		if d.escalated && d.status == "Pending" && now.Sub(d.createdAt) > 48*time.Hour {
			alerts = append(alerts, Alert{
				ID:          nextID(d.id, "urgent"),
				DiagnosisID: d.id,
				Category:    CategoryUrgent,
				Severity:    SeverityCritical,
				Title:       "Urgent: Case awaiting physician review",
				Message:     "Your " + d.condition + " case was escalated more than 48 hours ago and is still pending review.",
				IsRead:      false,
				CreatedAt:   now.Format(time.RFC3339),
			})
		}
	}

	// --- Rule 5: Preventive health check — no new diagnoses in 90 d ---
	if len(diags) == 0 || now.Sub(diags[0].createdAt) > 90*24*time.Hour {
		due := now.Add(7 * 24 * time.Hour)
		if len(diags) > 0 {
			due = diags[0].createdAt.Add(90 * 24 * time.Hour)
		}
		alerts = append(alerts, Alert{
			ID:           "preventive-" + now.Format("20060102"),
			Category:     CategoryPreventive,
			Severity:     SeverityLow,
			Title:        "Preventive health check due",
			Message:      "You haven't had a health check in over 90 days. Book a routine check-up to stay on top of your health.",
			ScheduledFor: due.Format(time.RFC3339),
			IsRead:       false,
			CreatedAt:    now.Format(time.RFC3339),
		})
	}

	return alerts
}

// itoa is a lightweight int-to-string for alert messages.
func itoa(n int) string {
	if n < 0 {
		return "0"
	}
	digits := [...]byte{'0', '1', '2', '3', '4', '5', '6', '7', '8', '9'}
	if n < 10 {
		return string([]byte{digits[n]})
	}
	buf := make([]byte, 0, 4)
	for n > 0 {
		buf = append([]byte{digits[n%10]}, buf...)
		n /= 10
	}
	return string(buf)
}
