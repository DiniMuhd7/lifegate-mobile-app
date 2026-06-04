// Package sla implements automatic SLA breach detection and case reassignment.
//
// The service runs as a background goroutine, polling every 2 minutes for:
//  1. Pending cases (physician_id IS NULL) older than 4 hours.
//  2. Active cases where physician_assigned_at is older than 4 hours.
//
// For each detected breach the service:
//   - Finds the next available physician (most completed cases, no current Active load).
//   - Auto-assigns (and activates) the case to that physician.
//   - Writes a row to sla_reassignment_log.
//   - Notifies the original physician (if any) via Expo push notification.
//   - Publishes a BreachEvent payload to the NATS subject admin.sla.breach.alert.
package sla

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/notifications"
)

const (
	// SLAWindow is the maximum allowed time before a case is considered breached.
	SLAWindow = 4 * time.Hour

	// CheckInterval is how often the enforcement loop runs.
	CheckInterval = 2 * time.Minute

	// NATSSubject is the subject published on every SLA breach event.
	NATSSubject = "admin.sla.breach.alert"
)

// BreachEvent is the JSON payload published to NATS and stored in the log.
type BreachEvent struct {
	CaseID                string `json:"caseId"`
	CaseTitle             string `json:"caseTitle"`
	Urgency               string `json:"urgency"`
	WaitSeconds           int64  `json:"waitSeconds"`
	OriginalPhysicianID   string `json:"originalPhysicianId,omitempty"`
	OriginalPhysicianName string `json:"originalPhysicianName,omitempty"`
	NewPhysicianID        string `json:"newPhysicianId,omitempty"`
	NewPhysicianName      string `json:"newPhysicianName,omitempty"`
	BreachedAt            string `json:"breachedAt"`
}

// Service runs the SLA enforcement background loop.
type Service struct {
	db   *sql.DB
	nats *natsclient.Client
	push *notifications.Service
}

// NewService creates a new SLA enforcement service.
func NewService(db *sql.DB, nats *natsclient.Client, push *notifications.Service) *Service {
	return &Service{db: db, nats: nats, push: push}
}

// Start runs the enforcement loop until ctx is cancelled.
// It should be invoked in a goroutine: go slaSvc.Start(ctx).
func (s *Service) Start(ctx context.Context) {
	ticker := time.NewTicker(CheckInterval)
	defer ticker.Stop()

	log.Printf("[SLA] Enforcement service started (window=%v, interval=%v)", SLAWindow, CheckInterval)

	// Run once immediately at startup, then on each tick.
	s.run(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[SLA] Enforcement service stopped")
			return
		case <-ticker.C:
			s.run(ctx)
		}
	}
}

// run performs one scan-and-enforce cycle.
func (s *Service) run(ctx context.Context) {
	s.processPendingBreaches(ctx)
	s.processActiveBreaches(ctx)
}

// processPendingBreaches detects and handles Pending cases with no physician
// assigned that have exceeded the SLA window.
func (s *Service) processPendingBreaches(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.id, COALESCE(d.title,''), COALESCE(d.urgency,'LOW'),
		       EXTRACT(EPOCH FROM (NOW() - d.created_at))::bigint
		FROM diagnoses d
		WHERE d.status = 'Pending'
		  AND d.physician_id IS NULL
		  AND d.created_at < NOW() - INTERVAL '4 hours'
		  AND NOT EXISTS (
		      SELECT 1 FROM sla_reassignment_log l
		      WHERE l.case_id = d.id
		        AND l.created_at > NOW() - INTERVAL '4 hours'
		  )
		ORDER BY d.created_at ASC
		LIMIT 20`)
	if err != nil {
		log.Printf("[SLA] processPendingBreaches query error: %v", err)
		return
	}
	defer rows.Close()

	type candidate struct {
		caseID      string
		caseTitle   string
		urgency     string
		waitSeconds int64
	}

	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.caseID, &c.caseTitle, &c.urgency, &c.waitSeconds); err != nil {
			log.Printf("[SLA] scan pending breach: %v", err)
			continue
		}
		candidates = append(candidates, c)
	}
	rows.Close()

	for _, c := range candidates {
		newID, newName := s.findAvailablePhysician(ctx, "")
		s.assignAndLog(ctx, c.caseID, c.caseTitle, c.urgency, c.waitSeconds,
			"", "", newID, newName)
	}
}

// processActiveBreaches detects and handles Active cases that have exceeded the
// SLA window since physician_assigned_at.
func (s *Service) processActiveBreaches(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.id, COALESCE(d.title,''), COALESCE(d.urgency,'LOW'),
		       EXTRACT(EPOCH FROM (NOW() - d.physician_assigned_at))::bigint,
		       d.physician_id::text, COALESCE(p.name,'')
		FROM diagnoses d
		JOIN users p ON p.id = d.physician_id
		WHERE d.status = 'Active'
		  AND d.physician_assigned_at IS NOT NULL
		  AND d.physician_assigned_at < NOW() - INTERVAL '4 hours'
		  AND NOT EXISTS (
		      SELECT 1 FROM sla_reassignment_log l
		      WHERE l.case_id = d.id
		        AND l.created_at > NOW() - INTERVAL '4 hours'
		  )
		ORDER BY d.physician_assigned_at ASC
		LIMIT 20`)
	if err != nil {
		log.Printf("[SLA] processActiveBreaches query error: %v", err)
		return
	}
	defer rows.Close()

	type candidate struct {
		caseID               string
		caseTitle            string
		urgency              string
		waitSeconds          int64
		originalPhysicianID  string
		originalPhysicianName string
	}

	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.caseID, &c.caseTitle, &c.urgency, &c.waitSeconds,
			&c.originalPhysicianID, &c.originalPhysicianName); err != nil {
			log.Printf("[SLA] scan active breach: %v", err)
			continue
		}
		candidates = append(candidates, c)
	}
	rows.Close()

	for _, c := range candidates {
		newID, newName := s.findAvailablePhysician(ctx, c.originalPhysicianID)

		// Notify the original physician about the reassignment before reassigning.
		if c.originalPhysicianID != "" {
			origID := c.originalPhysicianID
			title := c.caseTitle
			caseID := c.caseID
			go s.push.SendToPhysician(context.Background(), origID,
				"Case Reassigned – SLA Breach",
				"Case \""+title+"\" has been reassigned to another physician due to an SLA breach.",
				map[string]string{"caseId": caseID, "type": "sla_reassignment"})
		}

		s.assignAndLog(ctx, c.caseID, c.caseTitle, c.urgency, c.waitSeconds,
			c.originalPhysicianID, c.originalPhysicianName, newID, newName)
	}
}

// findAvailablePhysician returns the id and name of the most capable available
// physician (most completed cases, zero Active workload).
// excludeID (empty string → no exclusion) prevents re-assigning to the same doctor.
func (s *Service) findAvailablePhysician(ctx context.Context, excludeID string) (id, name string) {
	var row *sql.Row
	if excludeID != "" {
		row = s.db.QueryRowContext(ctx, `
			SELECT u.id::text, u.name
			FROM users u
			WHERE u.role = 'professional'
			  AND u.account_status = 'active'
			  AND u.id != $1::uuid
			  AND NOT EXISTS (
			      SELECT 1 FROM diagnoses d
			      WHERE d.physician_id = u.id AND d.status = 'Active'
			  )
			ORDER BY (
			    SELECT COUNT(*) FROM diagnoses d2
			    WHERE d2.physician_id = u.id AND d2.status = 'Completed'
			) DESC
			LIMIT 1`, excludeID)
	} else {
		row = s.db.QueryRowContext(ctx, `
			SELECT u.id::text, u.name
			FROM users u
			WHERE u.role = 'professional'
			  AND u.account_status = 'active'
			  AND NOT EXISTS (
			      SELECT 1 FROM diagnoses d
			      WHERE d.physician_id = u.id AND d.status = 'Active'
			  )
			ORDER BY (
			    SELECT COUNT(*) FROM diagnoses d2
			    WHERE d2.physician_id = u.id AND d2.status = 'Completed'
			) DESC
			LIMIT 1`)
	}

	if err := row.Scan(&id, &name); err != nil {
		if err != sql.ErrNoRows {
			log.Printf("[SLA] findAvailablePhysician: %v", err)
		}
		return "", ""
	}
	return id, name
}

// assignAndLog assigns the case to newPhysicianID (if non-empty), writes the
// breach event to sla_reassignment_log, and publishes to NATS.
func (s *Service) assignAndLog(
	ctx context.Context,
	caseID, caseTitle, urgency string,
	waitSeconds int64,
	originalPhysicianID, originalPhysicianName,
	newPhysicianID, newPhysicianName string,
) {
	if newPhysicianID != "" {
		_, err := s.db.ExecContext(ctx, `
			UPDATE diagnoses
			SET physician_id          = $1::uuid,
			    physician_assigned_at = NOW(),
			    status                = 'Active',
			    updated_at            = NOW()
			WHERE id = $2::uuid
			  AND status IN ('Pending', 'Active')
			  AND (physician_id IS NULL OR physician_id != $1::uuid)`,
			newPhysicianID, caseID)
		if err != nil {
			log.Printf("[SLA] assign case %s to physician %s: %v", caseID, newPhysicianID, err)
		}

		// Notify the new physician.
		go s.push.SendToPhysician(context.Background(), newPhysicianID,
			"Case Auto-Assigned (SLA Breach)",
			"Case \""+caseTitle+"\" has been auto-assigned to you because it exceeded the 4-hour SLA window.",
			map[string]string{"caseId": caseID, "type": "sla_auto_assign"})
	}

	// Convert IDs to interface{} so NULL can be stored for the UUID columns.
	var origIDArg, newIDArg interface{}
	if originalPhysicianID != "" {
		origIDArg = originalPhysicianID
	}
	if newPhysicianID != "" {
		newIDArg = newPhysicianID
	}

	var logID string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO sla_reassignment_log
		    (case_id, case_title, urgency, wait_seconds,
		     original_physician_id, original_physician_name,
		     new_physician_id, new_physician_name)
		VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7::uuid, $8)
		RETURNING id::text`,
		caseID, caseTitle, urgency, waitSeconds,
		origIDArg, originalPhysicianName,
		newIDArg, newPhysicianName,
	).Scan(&logID)
	if err != nil {
		log.Printf("[SLA] insert reassignment log for case %s: %v", caseID, err)
		return
	}

	// Publish NATS breach event.
	event := BreachEvent{
		CaseID:                caseID,
		CaseTitle:             caseTitle,
		Urgency:               urgency,
		WaitSeconds:           waitSeconds,
		OriginalPhysicianID:   originalPhysicianID,
		OriginalPhysicianName: originalPhysicianName,
		NewPhysicianID:        newPhysicianID,
		NewPhysicianName:      newPhysicianName,
		BreachedAt:            time.Now().UTC().Format(time.RFC3339),
	}
	payload, _ := json.Marshal(event)
	if err := s.nats.Publish(NATSSubject, payload); err != nil {
		log.Printf("[SLA] NATS publish for case %s: %v", caseID, err)
	} else {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE sla_reassignment_log SET nats_published = TRUE WHERE id = $1::uuid`, logID)
	}

	log.Printf("[SLA] breach handled: case=%s urgency=%s wait=%ds newPhysician=%q",
		caseID, urgency, waitSeconds, newPhysicianName)
}
