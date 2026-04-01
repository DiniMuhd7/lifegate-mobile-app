package sessions

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler exposes HTTP endpoints for chat session CRUD.
type Handler struct {
	svc *Service
}

// NewHandler creates a new Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func respond(c *gin.Context, code int, success bool, message string, data interface{}) {
	body := gin.H{"success": success, "message": message}
	if data != nil {
		body["data"] = data
	}
	c.JSON(code, body)
}

// uid extracts the authenticated user ID from the Gin context (set by Auth middleware).
func uid(c *gin.Context) string {
	v, _ := c.Get("userID")
	s, _ := v.(string)
	return s
}

// Create handles POST /api/sessions.
func (h *Handler) Create(c *gin.Context) {
	var req struct {
		Title    string          `json:"title"`
		Category string          `json:"category"`
		Mode     string          `json:"mode"`
		Messages json.RawMessage `json:"messages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body", nil)
		return
	}

	session, err := h.svc.Create(c.Request.Context(), uid(c), req.Title, req.Category, req.Mode, req.Messages)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to create session", nil)
		return
	}
	respond(c, http.StatusCreated, true, "Session created", session)
}

// List handles GET /api/sessions.
func (h *Handler) List(c *gin.Context) {
	sessions, err := h.svc.List(c.Request.Context(), uid(c))
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to list sessions", nil)
		return
	}
	if sessions == nil {
		sessions = []Session{} // return [] not null
	}
	respond(c, http.StatusOK, true, "Sessions retrieved", sessions)
}

// GetIncomplete handles GET /api/sessions/incomplete.
// Must be registered before the /:id route so the router does not treat
// "incomplete" as a session ID.
// Returns data: null when no incomplete session exists.
func (h *Handler) GetIncomplete(c *gin.Context) {
	session, err := h.svc.GetIncomplete(c.Request.Context(), uid(c))
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to fetch incomplete session", nil)
		return
	}
	// session may be nil — the client checks whether data is null.
	respond(c, http.StatusOK, true, "OK", session)
}

// Get handles GET /api/sessions/:id.
func (h *Handler) Get(c *gin.Context) {
	session, err := h.svc.Get(c.Request.Context(), c.Param("id"), uid(c))
	if errors.Is(err, ErrNotFound) {
		respond(c, http.StatusNotFound, false, "Session not found", nil)
		return
	}
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to fetch session", nil)
		return
	}
	respond(c, http.StatusOK, true, "Session retrieved", session)
}

// Update handles PUT /api/sessions/:id.
func (h *Handler) Update(c *gin.Context) {
	var req struct {
		Title    *string         `json:"title"`
		Category *string         `json:"category"`
		Mode     *string         `json:"mode"`
		Status   *string         `json:"status"`
		Messages json.RawMessage `json:"messages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, "Invalid request body", nil)
		return
	}

	if req.Status != nil {
		switch *req.Status {
		case "active", "completed", "abandoned":
			// valid
		default:
			respond(c, http.StatusBadRequest, false, "status must be one of: active, completed, abandoned", nil)
			return
		}
	}

	in := UpdateInput{
		Title:    req.Title,
		Category: req.Category,
		Mode:     req.Mode,
		Status:   req.Status,
		Messages: req.Messages,
	}

	session, err := h.svc.Update(c.Request.Context(), c.Param("id"), uid(c), in)
	if errors.Is(err, ErrNotFound) {
		respond(c, http.StatusNotFound, false, "Session not found", nil)
		return
	}
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to update session", nil)
		return
	}
	respond(c, http.StatusOK, true, "Session updated", session)
}

// Delete handles DELETE /api/sessions/:id.
func (h *Handler) Delete(c *gin.Context) {
	err := h.svc.Delete(c.Request.Context(), c.Param("id"), uid(c))
	if errors.Is(err, ErrNotFound) {
		respond(c, http.StatusNotFound, false, "Session not found", nil)
		return
	}
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to delete session", nil)
		return
	}
	respond(c, http.StatusOK, true, "Session deleted", nil)
}
