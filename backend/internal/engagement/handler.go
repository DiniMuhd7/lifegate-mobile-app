package engagement

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler exposes POST /sessions/app/start and POST /sessions/app/end.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// StartSession godoc
//
//	@Summary      Record app session start
//	@Tags         engagement
//	@Security     BearerAuth
//	@Success      200  {object}  object{sessionId=string}
//	@Failure      500  {object}  object{message=string}
//	@Router       /sessions/app/start [post]
func (h *Handler) StartSession(c *gin.Context) {
	userID := c.GetString("userID")
	role := c.GetString("userRole")
	if role == "" {
		role = "patient"
	}
	id, err := h.repo.StartSession(userID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to start session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessionId": id})
}

// EndSession godoc
//
//	@Summary      Record app session end
//	@Tags         engagement
//	@Security     BearerAuth
//	@Param        id  path  string  true  "Session ID"
//	@Success      200  {object}  object{ok=bool}
//	@Failure      400  {object}  object{message=string}
//	@Router       /sessions/app/{id}/end [post]
func (h *Handler) EndSession(c *gin.Context) {
	sessionID := c.Param("id")
	userID := c.GetString("userID")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Session ID required"})
		return
	}
	if err := h.repo.EndSession(sessionID, userID); err != nil {
		// Not fatal — app may have been killed before end was sent; just ignore
		c.JSON(http.StatusOK, gin.H{"ok": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
