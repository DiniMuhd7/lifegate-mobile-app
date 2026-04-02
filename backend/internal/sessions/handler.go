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
//
// @Summary      Create chat session
// @Tags         sessions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{title=string,category=string,mode=string,messages=array}  false  "Session data"
// @Success      201   {object}  object{success=bool,message=string,data=object}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /sessions [post]
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
//
// @Summary      List chat sessions
// @Tags         sessions
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=array}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /sessions [get]
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

// GetIncomplete returns the most recent incomplete (active) session, or null.
//
// @Summary      Get incomplete session
// @Description  Returns the user's most recent active session if one exists, or data: null.
// @Tags         sessions
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=object}
// @Failure      500  {object}  object{success=bool,message=string}
// @Router       /sessions/incomplete [get]
func (h *Handler) GetIncomplete(c *gin.Context) {
	session, err := h.svc.GetIncomplete(c.Request.Context(), uid(c))
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to fetch incomplete session", nil)
		return
	}
	// session may be nil — the client checks whether data is null.
	respond(c, http.StatusOK, true, "OK", session)
}

// Get returns a single chat session by ID.
//
// @Summary      Get chat session
// @Tags         sessions
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Session ID"
// @Success      200  {object}  object{success=bool,message=string,data=object}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /sessions/{id} [get]
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
//
// @Summary      Update chat session
// @Tags         sessions
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string  true  "Session ID"
// @Param        body  body      object{title=string,category=string,mode=string,status=string,messages=array}  false  "Fields to update"
// @Success      200   {object}  object{success=bool,message=string,data=object}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      404   {object}  object{success=bool,message=string}
// @Router       /sessions/{id} [put]
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

// Delete removes a chat session by ID.
//
// @Summary      Delete chat session
// @Tags         sessions
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Session ID"
// @Success      200  {object}  object{success=bool,message=string}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /sessions/{id} [delete]
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
