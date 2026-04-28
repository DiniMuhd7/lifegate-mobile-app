package physician

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
)

const (
	autoAssignInterval   = 1 * time.Minute
	reassignAfter        = 30 * time.Minute
	autoAssignBatchLimit = 20
)

type activeAutoCase struct {
	CaseID           string
	PatientID        string
	CaseTitle        string
	CurrentPhysician string
}

type autoIMMessage struct {
	ID          string
	DiagnosisID string
	SenderID    string
	SenderRole  string
	SenderName  string
	Content     string
	CreatedAt   time.Time
}

// StartAutoAssignment runs a background loop that:
//  1. Automatically assigns unowned pending cases to verified physicians.
//  2. Reassigns active cases to another verified physician when not completed
//     within the 30-minute reassignment window.
func (s *Service) StartAutoAssignment(ctx context.Context) {
	ticker := time.NewTicker(autoAssignInterval)
	defer ticker.Stop()

	log.Printf("[physician-auto-assign] worker started (interval=%v reassignment_after=%v)", autoAssignInterval, reassignAfter)
	s.runAutoAssignmentCycle(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[physician-auto-assign] worker stopped")
			return
		case <-ticker.C:
			s.runAutoAssignmentCycle(ctx)
		}
	}
}

func (s *Service) runAutoAssignmentCycle(ctx context.Context) {
	s.autoAssignPendingCases(ctx)
	s.reassignStaleActiveCases(ctx)
}

func (s *Service) autoAssignPendingCases(ctx context.Context) {
	caseIDs, err := s.repo.listPendingUnassignedCaseIDs(ctx, autoAssignBatchLimit)
	if err != nil {
		log.Printf("[physician-auto-assign] list pending cases: %v", err)
		return
	}

	for _, caseID := range caseIDs {
		physicianID, physicianName, findErr := s.repo.findAvailableVerifiedPhysician(ctx, "")
		if findErr != nil {
			log.Printf("[physician-auto-assign] pick physician for case %s: %v", caseID, findErr)
			continue
		}
		if physicianID == "" {
			// No verified physician available right now.
			continue
		}

		patientID, assigned, assignErr := s.repo.assignPendingCaseToPhysician(ctx, caseID, physicianID)
		if assignErr != nil {
			log.Printf("[physician-auto-assign] assign case %s to %s: %v", caseID, physicianID, assignErr)
			continue
		}
		if !assigned {
			// Case was taken by another actor meanwhile.
			continue
		}

		s.broadcastQueueChange(caseID, physicianID, "Active")

		doctorName := normalizedDoctorName(physicianName)
		message := fmt.Sprintf("Hello, I am Dr. %s and I will review your case within 15 minutes.", doctorName)
		s.notifyPatientWithAutomatedDoctorMessage(ctx, caseID, patientID, physicianID, doctorName, message, false)
	}
}

func (s *Service) reassignStaleActiveCases(ctx context.Context) {
	cutoff := time.Now().UTC().Add(-reassignAfter)
	cases, err := s.repo.listStaleActiveCases(ctx, cutoff, autoAssignBatchLimit)
	if err != nil {
		log.Printf("[physician-auto-assign] list stale active cases: %v", err)
		return
	}

	for _, c := range cases {
		newPhysicianID, newPhysicianName, findErr := s.repo.findAvailableVerifiedPhysician(ctx, c.CurrentPhysician)
		if findErr != nil {
			log.Printf("[physician-auto-assign] pick reassignment physician for case %s: %v", c.CaseID, findErr)
			continue
		}
		if newPhysicianID == "" {
			continue
		}

		patientID, reassigned, reassignErr := s.repo.reassignActiveCase(ctx, c.CaseID, c.CurrentPhysician, newPhysicianID)
		if reassignErr != nil {
			log.Printf("[physician-auto-assign] reassign case %s (%s -> %s): %v", c.CaseID, c.CurrentPhysician, newPhysicianID, reassignErr)
			continue
		}
		if !reassigned {
			continue
		}

		s.broadcastQueueChange(c.CaseID, newPhysicianID, "Active")

		doctorName := normalizedDoctorName(newPhysicianName)
		message := fmt.Sprintf("Hello, I am Dr. %s and your case has been reassigned to me and will be reviewed within 15 minutes.", doctorName)
		s.notifyPatientWithAutomatedDoctorMessage(ctx, c.CaseID, patientID, newPhysicianID, doctorName, message, true)
	}
}

func (s *Service) notifyPatientWithAutomatedDoctorMessage(
	ctx context.Context,
	caseID, patientID, physicianID, physicianName, content string,
	sendPush bool,
) {
	if patientID == "" {
		return
	}

	msg, err := s.repo.insertAutomatedPhysicianMessage(ctx, caseID, physicianID, physicianName, content)
	if err != nil {
		log.Printf("[physician-auto-assign] insert automated IM for case %s: %v", caseID, err)
	} else if s.broadcaster != nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"id":           msg.ID,
			"diagnosis_id": msg.DiagnosisID,
			"sender_id":    msg.SenderID,
			"sender_role":  msg.SenderRole,
			"sender_name":  msg.SenderName,
			"content":      msg.Content,
			"created_at":   msg.CreatedAt.Format(time.RFC3339),
			"read_at":      nil,
		})
		s.broadcaster.BroadcastToUser(patientID, "im.message", payload)
	}

	if sendPush && s.push != nil {
		s.push.SendToUser(ctx, patientID,
			"Case Reassigned",
			"Your case has been reassigned to another verified doctor and will be reviewed shortly.",
			map[string]string{"type": "case_reassigned", "diagnosisId": caseID},
		)
	}
}

func normalizedDoctorName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Doctor"
	}
	return trimmed
}

func (r *Repository) listPendingUnassignedCaseIDs(ctx context.Context, limit int) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id::text
		FROM diagnoses
		WHERE status = 'Pending'
		  AND physician_id IS NULL
		ORDER BY created_at ASC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	caseIDs := make([]string, 0, limit)
	for rows.Next() {
		var caseID string
		if scanErr := rows.Scan(&caseID); scanErr != nil {
			return nil, scanErr
		}
		caseIDs = append(caseIDs, caseID)
	}
	return caseIDs, rows.Err()
}

func (r *Repository) listStaleActiveCases(ctx context.Context, cutoff time.Time, limit int) ([]activeAutoCase, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id::text, user_id::text, COALESCE(title, ''), COALESCE(physician_id::text, '')
		FROM diagnoses
		WHERE status = 'Active'
		  AND physician_id IS NOT NULL
		  AND physician_assigned_at IS NOT NULL
		  AND physician_assigned_at <= $1
		ORDER BY physician_assigned_at ASC
		LIMIT $2`, cutoff, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cases := make([]activeAutoCase, 0, limit)
	for rows.Next() {
		var c activeAutoCase
		if scanErr := rows.Scan(&c.CaseID, &c.PatientID, &c.CaseTitle, &c.CurrentPhysician); scanErr != nil {
			return nil, scanErr
		}
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

func (r *Repository) findAvailableVerifiedPhysician(ctx context.Context, excludePhysicianID string) (id, name string, err error) {
	var row *sql.Row
	if strings.TrimSpace(excludePhysicianID) != "" {
		row = r.db.QueryRowContext(ctx, `
			SELECT u.id::text, COALESCE(NULLIF(u.name,''), 'Doctor')
			FROM users u
			WHERE u.role = 'professional'
			  AND u.account_status = 'active'
			  AND u.mdcn_verified = TRUE
			  AND u.id != $1::uuid
			ORDER BY
			  (SELECT COUNT(*) FROM diagnoses d WHERE d.physician_id = u.id AND d.status = 'Active') ASC,
			  (SELECT COUNT(*) FROM diagnoses d2 WHERE d2.physician_id = u.id AND d2.status = 'Completed') DESC,
			  u.created_at ASC
			LIMIT 1`, excludePhysicianID)
	} else {
		row = r.db.QueryRowContext(ctx, `
			SELECT u.id::text, COALESCE(NULLIF(u.name,''), 'Doctor')
			FROM users u
			WHERE u.role = 'professional'
			  AND u.account_status = 'active'
			  AND u.mdcn_verified = TRUE
			ORDER BY
			  (SELECT COUNT(*) FROM diagnoses d WHERE d.physician_id = u.id AND d.status = 'Active') ASC,
			  (SELECT COUNT(*) FROM diagnoses d2 WHERE d2.physician_id = u.id AND d2.status = 'Completed') DESC,
			  u.created_at ASC
			LIMIT 1`)
	}

	err = row.Scan(&id, &name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return id, name, err
}

func (r *Repository) assignPendingCaseToPhysician(ctx context.Context, caseID, physicianID string) (patientID string, assigned bool, err error) {
	err = r.db.QueryRowContext(ctx, `
		UPDATE diagnoses
		SET physician_id = $1::uuid,
		    status = 'Active',
		    physician_assigned_at = NOW(),
		    updated_at = NOW()
		WHERE id = $2::uuid
		  AND status = 'Pending'
		  AND physician_id IS NULL
		RETURNING user_id::text`, physicianID, caseID).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return patientID, true, nil
}

func (r *Repository) reassignActiveCase(ctx context.Context, caseID, currentPhysicianID, newPhysicianID string) (patientID string, reassigned bool, err error) {
	err = r.db.QueryRowContext(ctx, `
		UPDATE diagnoses
		SET physician_id = $1::uuid,
		    physician_assigned_at = NOW(),
		    updated_at = NOW()
		WHERE id = $2::uuid
		  AND status = 'Active'
		  AND physician_id = $3::uuid
		RETURNING user_id::text`, newPhysicianID, caseID, currentPhysicianID).Scan(&patientID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return patientID, true, nil
}

func (r *Repository) insertAutomatedPhysicianMessage(
	ctx context.Context,
	diagnosisID, physicianID, physicianName, content string,
) (*autoIMMessage, error) {
	msg := &autoIMMessage{}
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO instant_messages (diagnosis_id, sender_id, sender_role, sender_name, content)
		VALUES ($1::uuid, $2::uuid, 'professional', $3, $4)
		RETURNING id::text, diagnosis_id::text, sender_id::text, sender_role, sender_name, content, created_at`,
		diagnosisID, physicianID, physicianName, content,
	).Scan(&msg.ID, &msg.DiagnosisID, &msg.SenderID, &msg.SenderRole, &msg.SenderName, &msg.Content, &msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}
