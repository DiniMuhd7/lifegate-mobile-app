package physician

// workspace.go — CRUD for a human physician's editable AI workspace content.
//
// Physicians who enable AI mode can customise three Markdown sections that are
// injected into the OpenClaw system prompt instead of the generic fallback:
//
//   IdentityMD  — personal profile, specialisation, languages, background
//   UserMD      — communication style, tone, patient interaction philosophy
//   PersonaMD   — free-form personalisation layer (injected last)
//
// AGENT.md and SOUL.md are NOT editable; the platform enforces their safety
// constraints directly in the OpenClaw worker for human AI-mode physicians.

import (
	"database/sql"
	"errors"
	"strings"
)

// Character limits per section — enforced at the service layer.
const (
	WorkspaceIdentityLimit = 4000
	WorkspaceUserLimit     = 4000
	WorkspacePersonaLimit  = 2000
)

// Workspace holds the editable sections for one physician.
type Workspace struct {
	IdentityMD string `json:"identity_md"`
	UserMD     string `json:"user_md"`
	PersonaMD  string `json:"persona_md"`
}

// WorkspaceInput carries the update payload from the handler.
type WorkspaceInput struct {
	IdentityMD string `json:"identity_md"`
	UserMD     string `json:"user_md"`
	PersonaMD  string `json:"persona_md"`
}

// ── Repository ────────────────────────────────────────────────────────────────

// GetWorkspace returns the physician's saved workspace, or a zero-value
// Workspace if no row exists yet (first-time access).
func (r *Repository) GetWorkspace(physicianID string) (*Workspace, error) {
	var w Workspace
	err := r.db.QueryRow(`
		SELECT identity_md, user_md, persona_md
		FROM   physician_workspace
		WHERE  physician_id = $1::uuid`,
		physicianID,
	).Scan(&w.IdentityMD, &w.UserMD, &w.PersonaMD)
	if errors.Is(err, sql.ErrNoRows) {
		return &Workspace{}, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// SaveWorkspace upserts the physician's workspace content.
func (r *Repository) SaveWorkspace(physicianID string, in WorkspaceInput) error {
	_, err := r.db.Exec(`
		INSERT INTO physician_workspace (physician_id, identity_md, user_md, persona_md, updated_at)
		VALUES ($1::uuid, $2, $3, $4, NOW())
		ON CONFLICT (physician_id) DO UPDATE
		SET identity_md = EXCLUDED.identity_md,
		    user_md     = EXCLUDED.user_md,
		    persona_md  = EXCLUDED.persona_md,
		    updated_at  = NOW()`,
		physicianID, in.IdentityMD, in.UserMD, in.PersonaMD,
	)
	return err
}

// ── Service ───────────────────────────────────────────────────────────────────

// WorkspaceCacheInvalidator is satisfied by *openclaw.Worker.
// It lets the service bust the in-memory persona cache for one physician
// immediately after their workspace is saved, so the next reply cycle picks
// up the updated content without a server restart.
type WorkspaceCacheInvalidator interface {
	InvalidatePersonaCache(physicianID string)
}

// GetWorkspace returns the physician's current workspace content.
// If ai_mode_enabled is false for this physician, it returns an error so the
// handler can respond with 403 before any DB work is done.
func (s *Service) GetWorkspace(physicianID string) (*Workspace, error) {
	enabled, err := s.repo.GetAIMode(physicianID)
	if err != nil {
		return nil, err
	}
	if !enabled {
		return nil, ErrAIModeNotEnabled
	}
	return s.repo.GetWorkspace(physicianID)
}

// SaveWorkspace validates and persists a workspace update, then invalidates
// the openclaw worker's persona cache for this physician.
func (s *Service) SaveWorkspace(physicianID string, in WorkspaceInput, inv WorkspaceCacheInvalidator) error {
	enabled, err := s.repo.GetAIMode(physicianID)
	if err != nil {
		return err
	}
	if !enabled {
		return ErrAIModeNotEnabled
	}

	// Enforce per-section character limits.
	if len([]rune(in.IdentityMD)) > WorkspaceIdentityLimit {
		return &WorkspaceValidationError{Field: "identity_md", Limit: WorkspaceIdentityLimit}
	}
	if len([]rune(in.UserMD)) > WorkspaceUserLimit {
		return &WorkspaceValidationError{Field: "user_md", Limit: WorkspaceUserLimit}
	}
	if len([]rune(in.PersonaMD)) > WorkspacePersonaLimit {
		return &WorkspaceValidationError{Field: "persona_md", Limit: WorkspacePersonaLimit}
	}

	// Strip null bytes that some editors can inject.
	in.IdentityMD = strings.ReplaceAll(in.IdentityMD, "\x00", "")
	in.UserMD = strings.ReplaceAll(in.UserMD, "\x00", "")
	in.PersonaMD = strings.ReplaceAll(in.PersonaMD, "\x00", "")

	if err := s.repo.SaveWorkspace(physicianID, in); err != nil {
		return err
	}

	// Bust the persona cache so the worker loads the new content immediately.
	if inv != nil {
		inv.InvalidatePersonaCache(physicianID)
	}
	return nil
}

// ── Errors ────────────────────────────────────────────────────────────────────

// ErrAIModeNotEnabled is returned when a workspace operation is attempted while
// the physician's AI mode is off.
var ErrAIModeNotEnabled = errors.New("AI mode is not enabled for this physician")

// WorkspaceValidationError is returned when a section exceeds its character limit.
type WorkspaceValidationError struct {
	Field string
	Limit int
}

func (e *WorkspaceValidationError) Error() string {
	return e.Field + " exceeds the " + itoa(e.Limit) + "-character limit"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 7)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}
