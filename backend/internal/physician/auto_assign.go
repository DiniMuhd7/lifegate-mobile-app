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

// pendingCase carries just enough context to route a new case to the right
// specialist.  Populated by listPendingUnassignedCases.
type pendingCase struct {
	CaseID    string
	Title     string
	Condition string // EDIS primary condition, may be empty
	Urgency   string // EDIS urgency: Critical / High / Medium / Low
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
	cases, err := s.repo.listPendingUnassignedCases(ctx, autoAssignBatchLimit)
	if err != nil {
		log.Printf("[physician-auto-assign] list pending cases: %v", err)
		return
	}

	for _, pc := range cases {
		// Determine the best physician slug from the EDIS condition + urgency.
		preferredSlug := choosePhysicianSlug(pc.Title, pc.Condition, pc.Urgency)

		var physicianID, physicianName string
		if preferredSlug != "" {
			// Try the specialty-matched physician first.
			physicianID, physicianName, err = s.repo.findPhysicianBySlug(ctx, preferredSlug)
			if err != nil {
				log.Printf("[physician-auto-assign] find slug %s for case %s: %v", preferredSlug, pc.CaseID, err)
			}
		}
		if physicianID == "" {
			// Specialty physician not available — fall back to load-balanced pick.
			physicianID, physicianName, err = s.repo.findAvailableVerifiedPhysician(ctx, "")
			if err != nil {
				log.Printf("[physician-auto-assign] pick physician for case %s: %v", pc.CaseID, err)
				continue
			}
		}
		if physicianID == "" {
			// No verified physician available right now.
			continue
		}

		patientID, assigned, assignErr := s.repo.assignPendingCaseToPhysician(ctx, pc.CaseID, physicianID)
		if assignErr != nil {
			log.Printf("[physician-auto-assign] assign case %s to %s: %v", pc.CaseID, physicianID, assignErr)
			continue
		}
		if !assigned {
			// Case was taken by another actor meanwhile.
			continue
		}

		s.broadcastQueueChange(pc.CaseID, physicianID, "Active")

		doctorName := normalizedDoctorName(physicianName)
		message := fmt.Sprintf("Hello, I am Dr. %s and I have been assigned to review your case. Please reply to this message so I can proceed with your final evaluation.", doctorName)
		s.notifyPatientWithAutomatedDoctorMessage(ctx, pc.CaseID, patientID, physicianID, doctorName, message, false)
	}
}

// choosePhysicianSlug maps an EDIS condition + title to the most appropriate
// OpenClaw agent slug.  Returns "" when no specific match exists (caller
// falls back to load-balanced pick).
//
// Rules from lifegate-openclaw/routing/routing-rules.md and
// lifegate-openclaw/routing/specialty-map.md.
func choosePhysicianSlug(title, condition, urgency string) string {
	lower := strings.ToLower(title + " " + condition)

	// Priority 1: CRITICAL urgency → Emergency Medicine (dr-terseer-tyav)
	if strings.EqualFold(urgency, "critical") {
		return "dr-terseer-tyav"
	}

	// Priority 2: HIGH urgency + red-flag presentation → Emergency Medicine
	if strings.EqualFold(urgency, "high") {
		if containsAny(lower,
			"chest pain", "can't breathe", "cannot breathe", "difficulty breathing",
			"shortness of breath", "unconscious", "unresponsive", "loss of consciousness",
			"seizure", "convulsion", "stroke", "facial droop",
			"eclampsia", "haemorrhage", "hemorrhage", "heavy bleeding",
		) {
			return "dr-terseer-tyav"
		}
	}

	// Priority 3: Specialty routing (specialty-map.md keyword → agent slug)
	switch {
	case containsAny(lower, "malaria", "typhoid", "fever chills", "tropical medicine"):
		return "dr-bassey-efiong"
	case containsAny(lower, "hiv", "tuberculosis", "sexually transmitted infection", "hepatitis"):
		return "dr-bassey-efiong"
	case containsAny(lower, "cough", "breathless", "wheeze", "pneumonia", "pulmonary"):
		return "dr-zainab-sani"
	case containsAny(lower, "chest pain", "palpitation", "hypertension", "high blood pressure", "heart attack", "heart failure"):
		return "dr-ibrahim-danladi"
	case containsAny(lower, "stroke", "facial droop", "limb weakness", "slurred speech", "seizure", "epilepsy", "headache", "migraine"):
		return "dr-babatunde-fasanya"
	case containsAny(lower, "insomnia", "sleep apnea", "sleep apnoea", "sleep disturbance"):
		return "dr-ramatu-usman"
	case containsAny(lower, "suicidal", "depression", "anxiety", "mental health", "psychiatr", "mood disorder"):
		return "dr-osagie-omoruyi"
	case containsAny(lower, "substance abuse", "alcohol abuse", "addiction", "drug abuse"):
		return "dr-osagie-omoruyi"
	case containsAny(lower, "child health", "paediatric", "pediatric", "infant", "vaccination", "growth faltering", "neonatal", "newborn"):
		return "dr-garba-suleiman"
	case containsAny(lower, "pregnancy", "antenatal", "obstetric", "labour", "labor", "maternal"):
		return "dr-aliyu-bello"
	case containsAny(lower, "vaginal bleeding", "pelvic pain", "menstrual", "gynaecolog", "gynecolog"):
		return "dr-esohe-oseni"
	case containsAny(lower, "infertil", "fertility", "conception difficulty"):
		return "dr-aliyu-bello"
	case containsAny(lower, "diabetes", "blood sugar", "insulin", "hba1c"):
		return "dr-bukar-mala"
	case containsAny(lower, "thyroid", "endocrin", "weight gain unexplained", "weight loss unexplained"):
		return "dr-bukar-mala"
	case containsAny(lower, "kidney disease", "renal failure", "creatinine high", "nephro"):
		return "dr-bukar-mala"
	case containsAny(lower, "abdominal pain", "diarrhoea", "diarrhea", "bowel changes", "gastro"):
		return "dr-ifeoma-onuoha"
	case containsAny(lower, "jaundice", "hepatitis b", "hepatitis c", "liver pain"):
		return "dr-ifeoma-onuoha"
	case containsAny(lower, "malnutrition", "poor nutrition"):
		return "dr-ifeoma-onuoha"
	case containsAny(lower, "eye pain", "blurry vision", "visual loss", "ophthalmol"):
		return "dr-emeka-ugwu"
	case containsAny(lower, "hearing loss", "ear pain", "tinnitus", "ringing ear", "otitis"):
		return "dr-iquo-archibong"
	case containsAny(lower, "sore throat", "sinusitis", "runny nose", "nasal congestion"):
		return "dr-iquo-archibong"
	case containsAny(lower, "skin rash", "skin lesion", "itching", "dermatol", "eczema"):
		return "dr-emeka-ugwu"
	case containsAny(lower, "joint pain", "back pain", "arthritis", "rheumat"):
		return "dr-adaeze-nwosu"
	case containsAny(lower, "fracture", "orthop", "musculoskeletal", "sports injury"):
		return "dr-danladi-musa"
	case containsAny(lower, "cancer", "tumour", "tumor", "oncol", "lump", "mass"):
		return "dr-danladi-musa"
	case containsAny(lower, "sickle cell", "anaemia", "anemia", "blood disorder", "haemat"):
		return "dr-danladi-musa"
	case containsAny(lower, "chronic pain", "pain management", "physiother", "rehabilitation"):
		return "dr-ojoche-ameh"
	case containsAny(lower, "sexual health", "contraception"):
		return "dr-chidinma-aneke"
	case containsAny(lower, "elderly", "geriatric", "dementia", "ageing", "aging"):
		return "dr-yetunde-akande"
	case containsAny(lower, "dental", "toothache", "gum disease"):
		return "dr-hadiza-maigari"
	case containsAny(lower, "public health", "community health", "outbreak"):
		return "dr-hadiza-maigari"
	default:
		// No keyword match — General Medicine is the OpenClaw default.
		return "dr-ahmed-musa"
	}
}

// containsAny reports whether s contains at least one of the given substrings.
func containsAny(s string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

func (s *Service) reassignStaleActiveCases(ctx context.Context) {
	cutoff := time.Now().UTC().Add(-reassignAfter)
	cases, err := s.repo.listStaleActiveCases(ctx, cutoff, autoAssignBatchLimit)
	if err != nil {
		log.Printf("[physician-auto-assign] list stale active cases: %v", err)
		return
	}

	for _, c := range cases {
		newPhysicianID, _, findErr := s.repo.findAvailableVerifiedPhysician(ctx, c.CurrentPhysician)
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

		// On reassignment send a push-only notification — no IM is inserted so the
		// patient is not flooded with automated messages each time a stale case is
		// handed to a new physician during the 30-minute rotation cycle.
		if s.push != nil {
			s.push.SendToUser(ctx, patientID,
				"Case Reassigned",
				"Your case has been reassigned to another verified doctor and will be reviewed shortly.",
				map[string]string{"type": "case_reassigned", "diagnosisId": c.CaseID},
			)
		}
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

// listPendingUnassignedCases returns pending unassigned cases with enough
// context (title, EDIS condition, urgency) to route them to the right specialist.
func (r *Repository) listPendingUnassignedCases(ctx context.Context, limit int) ([]pendingCase, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id::text,
		       COALESCE(title, ''),
		       COALESCE(condition, ''),
		       COALESCE(urgency, '')
		FROM diagnoses
		WHERE status = 'Pending'
		  AND physician_id IS NULL
		ORDER BY created_at ASC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cases := make([]pendingCase, 0, limit)
	for rows.Next() {
		var pc pendingCase
		if scanErr := rows.Scan(&pc.CaseID, &pc.Title, &pc.Condition, &pc.Urgency); scanErr != nil {
			return nil, scanErr
		}
		cases = append(cases, pc)
	}
	return cases, rows.Err()
}

// findPhysicianBySlug returns the first active verified physician with the
// given openclaw_agent_slug, or empty strings when none exists.
func (r *Repository) findPhysicianBySlug(ctx context.Context, slug string) (id, name string, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT u.id::text, COALESCE(NULLIF(u.name,''), 'Doctor')
		FROM users u
		WHERE u.role = 'professional'
		  AND u.account_status = 'active'
		  AND u.mdcn_verified = TRUE
		  AND u.openclaw_agent_slug = $1
		LIMIT 1`, slug).Scan(&id, &name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	return id, name, err
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
			  AND u.openclaw_agent_slug IS NOT NULL
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
			  AND u.openclaw_agent_slug IS NOT NULL
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
