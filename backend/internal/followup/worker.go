// Package followup implements the scheduled follow-up check worker.
//
// The worker runs every 5 minutes and processes diagnoses whose follow_up_date
// has arrived and whose outcome has not yet been checked:
//
//  1. Sends Expo push notification: "Did your symptoms improve?" with a deep-link
//     to the outcome response endpoint.
//  2. After a grace period (ResponseGracePeriod), re-scans for cases that still
//     have outcome_checked=FALSE (patient did not respond or reported worsening)
//     and auto-escalates them to the physician queue.
package followup

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/notifications"
)

const (
	// CheckInterval is how often the worker scans for due follow-ups.
	CheckInterval = 5 * time.Minute

	// ResponseGracePeriod is how long the worker waits for the patient to
	// respond after the first follow-up notification before auto-escalating.
	ResponseGracePeriod = 24 * time.Hour

	// NATSFollowUpEscalated is published when a case is auto-escalated due to
	// non-response or reported worsening.
	NATSFollowUpEscalated = "followup.escalated"
)

// Service is the follow-up background worker.
type Service struct {
	db   *sql.DB
	nats *natsclient.Client
	push *notifications.Service
}

// NewService returns a configured follow-up worker.
func NewService(db *sql.DB, nats *natsclient.Client, push *notifications.Service) *Service {
	return &Service{db: db, nats: nats, push: push}
}

// Start launches the background loop. It blocks until ctx is cancelled.
func (s *Service) Start(ctx context.Context) {
	log.Println("[follow-up] worker started")
	s.run(ctx) // run immediately on startup
	ticker := time.NewTicker(CheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("[follow-up] worker stopped")
			return
		case <-ticker.C:
			s.run(ctx)
		}
	}
}

func (s *Service) run(ctx context.Context) {
	s.sendDueNotifications(ctx)
	s.escalateNonResponders(ctx)
}

// ─── Step 1: Notify ──────────────────────────────────────────────────────────

// sendDueNotifications pushes "Did your symptoms improve?" to patients whose
// follow_up_date has arrived but who have not yet been notified or checked.
// We mark outcome_checked = TRUE after the notification is sent so the row is
// not re-notified on the next tick; escalateNonResponders will flip it back to
// FALSE (pending response) until the patient actually submits their outcome.
func (s *Service) sendDueNotifications(ctx context.Context) {
	rows, err := s.db.Query(`
		SELECT d.id::text, d.user_id::text,
		       COALESCE(d.condition,'Unknown condition'),
		       COALESCE(d.follow_up_instructions,''),
		       COALESCE(d.urgency,'LOW')
		FROM diagnoses d
		WHERE d.follow_up_date IS NOT NULL
		  AND d.follow_up_date <= NOW()
		  AND d.outcome_checked = FALSE
		  AND d.status NOT IN ('Completed')
		LIMIT 100`)
	if err != nil {
		log.Printf("[follow-up] sendDueNotifications query: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, userID, condition, instructions, urgency string
		if err := rows.Scan(&id, &userID, &condition, &instructions, &urgency); err != nil {
			continue
		}

		body := fmt.Sprintf("Time for your %s follow-up. Did your symptoms improve?", condition)
		data := map[string]string{
			"type":        "follow_up_check",
			"diagnosisId": id,
		}
		s.push.SendToUser(ctx, userID,
			"Follow-up Reminder 🩺",
			body,
			data,
		)

		// Mark as notified so we don't re-send on the next tick.
		// outcome_checked will be confirmed only when the patient responds via
		// the POST /api/diagnoses/:id/outcome endpoint.
		_, _ = s.db.Exec(`
			UPDATE diagnoses
			SET follow_up_notified_at = NOW()
			WHERE id = $1::uuid`, id)

		log.Printf("[follow-up] notified user=%s case=%s condition=%q", userID, id, condition)

		// Publish audit event.
		evt, _ := json.Marshal(map[string]string{
			"type":        "follow_up_notification_sent",
			"diagnosis_id": id,
			"user_id":     userID,
		})
		_ = s.nats.Publish("followup.notification.sent", evt)
	}
}

// ─── Step 2: Auto-escalate non-responders ────────────────────────────────────

// escalateNonResponders promotes cases to the physician queue when the patient
// has not submitted an outcome within ResponseGracePeriod of the follow-up date.
func (s *Service) escalateNonResponders(ctx context.Context) {
	rows, err := s.db.Query(`
		SELECT d.id::text, d.user_id::text,
		       COALESCE(d.condition,'Unknown condition'),
		       COALESCE(d.urgency,'LOW')
		FROM diagnoses d
		WHERE d.follow_up_date IS NOT NULL
		  AND d.follow_up_date + $1::interval <= NOW()
		  AND d.outcome_checked = FALSE
		  AND d.escalated = FALSE
		  AND d.status NOT IN ('Completed','Active')
		LIMIT 50`,
		fmt.Sprintf("%d seconds", int(ResponseGracePeriod.Seconds())),
	)
	if err != nil {
		log.Printf("[follow-up] escalateNonResponders query: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, userID, condition, urgency string
		if err := rows.Scan(&id, &userID, &condition, &urgency); err != nil {
			continue
		}

		// Escalate: set escalated=TRUE so it enters the physician review queue.
		_, updateErr := s.db.Exec(`
			UPDATE diagnoses
			SET escalated    = TRUE,
			    updated_at   = NOW()
			WHERE id = $1::uuid
			  AND outcome_checked = FALSE`,
			id,
		)
		if updateErr != nil {
			log.Printf("[follow-up] escalate case %s: %v", id, updateErr)
			continue
		}

		// Push notification to patient about the auto-escalation.
		s.push.SendToUser(ctx, userID,
			"Case Escalated to Physician 🏥",
			"We noticed you haven't checked in after your "+condition+" follow-up. A physician will review your case.",
			map[string]string{
				"type":        "follow_up_escalated",
				"diagnosisId": id,
			},
		)

		// Publish NATS event so the physician WebSocket hub and SLA service
		// are aware of the new escalated case.
		evt, _ := json.Marshal(map[string]interface{}{
			"diagnosis_id": id,
			"user_id":      userID,
			"condition":    condition,
			"urgency":      urgency,
			"reason":       "follow_up_no_response",
		})
		_ = s.nats.Publish(NATSFollowUpEscalated, evt)

		// Push notification to all physicians so they are alerted even when
		// the app is in the background.
		go s.push.BroadcastToAllPhysicians(ctx,
			"New Escalated Case 🏥",
			condition+" — patient did not respond to follow-up. Review required.",
			map[string]string{
				"type":        "physician.case.new",
				"caseId":      id,
				"urgency":     urgency,
			},
		)

		log.Printf("[follow-up] auto-escalated case=%s user=%s condition=%q (no response within grace period)", id, userID, condition)
	}
}
