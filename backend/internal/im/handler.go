package im

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// WSBroadcaster is satisfied by *websocket.Hub — kept as an interface to avoid
// a circular import. The handler uses it to push real-time IM events.
type WSBroadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
}

// PushNotifier is satisfied by *notifications.Service and is used to send
// Expo push notifications when the counterpart is not connected via WebSocket.
type PushNotifier interface {
	SendToUser(ctx context.Context, userID, title, body string, data map[string]string)
	SendToPhysician(ctx context.Context, physicianID, title, body string, data map[string]string)
}

// Handler exposes the IM HTTP endpoints.
type Handler struct {
	svc     *Service
	db      *sql.DB
	hub     WSBroadcaster
	pushSvc PushNotifier
}

// NewHandler builds a Handler.
//
//	db      — used only for looking up the authenticated user's display name.
//	hub     — optional; if non-nil, new messages are broadcast in real time.
//	pushSvc — optional; if non-nil, a push notification is sent to the counterpart.
func NewHandler(svc *Service, db *sql.DB, hub WSBroadcaster, pushSvc PushNotifier) *Handler {
	return &Handler{svc: svc, db: db, hub: hub, pushSvc: pushSvc}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func uid(c *gin.Context) string {
	v, _ := c.Get("userID")
	s, _ := v.(string)
	return s
}

func role(c *gin.Context) string {
	v, _ := c.Get("role")
	s, _ := v.(string)
	return s
}

// lookupName fetches the display name for the given user ID from the users table.
// Returns an empty string (non-fatal) if the lookup fails.
func (h *Handler) lookupName(userID string) string {
	var name string
	_ = h.db.QueryRow(`SELECT name FROM users WHERE id = $1`, userID).Scan(&name)
	return name
}

// respondError writes a consistent JSON error response.
func respondError(c *gin.Context, code int, message string) {
	c.JSON(code, gin.H{"success": false, "message": message})
}

// ─── GET /im/:diagnosisId ────────────────────────────────────────────────────

// ListMessages returns all messages for the given diagnosis, oldest-first.
// It also marks all incoming messages (sent by the opposite role) as read,
// and emits a read-receipt WS event to the other party.
func (h *Handler) ListMessages(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")
	callerRole := role(c)
	callerID := uid(c)

	msgs, err := h.svc.GetMessages(diagnosisID)
	if err != nil {
		log.Printf("im: list messages error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to load messages")
		return
	}

	// Mark incoming messages as read and emit a real-time read-receipt.
	if markErr := h.svc.MarkRead(diagnosisID, callerRole); markErr != nil {
		log.Printf("im: mark read error: %v", markErr)
	} else if h.hub != nil {
		// Find the sender of any messages sent TO this caller (i.e. by the other side)
		// and notify them that the messages have been read.
		for _, m := range msgs {
			if m.SenderRole != callerRole && m.ReadAt == nil {
				payload, _ := json.Marshal(map[string]string{
					"diagnosis_id": diagnosisID,
					"reader_id":    callerID,
					"reader_role":  callerRole,
				})
				h.hub.BroadcastToUser(m.SenderID, "im.read_receipt", payload)
				break // one broadcast is sufficient
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    msgs,
	})
}

// ─── POST /im/:diagnosisId ───────────────────────────────────────────────────

type sendRequest struct {
	Content string `json:"content" binding:"required"`
}

// SendMessage creates a new IM message and broadcasts it to the counterpart
// via WebSocket.
//
// Access-control note: this endpoint allows both "user" and "professional"
// roles. The caller is identified by their JWT claims. The counterpart is
// identified by scanning existing conversation messages for the other role.
func (h *Handler) SendMessage(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")

	var req sendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "content is required")
		return
	}

	senderID := uid(c)
	senderRole := role(c)
	senderName := h.lookupName(senderID)

	msg, err := h.svc.SendMessage(diagnosisID, senderID, senderRole, senderName, req.Content)
	if err != nil {
		var ve *ValidationError
		if errors.As(err, &ve) {
			respondError(c, http.StatusBadRequest, ve.Message)
			return
		}
		log.Printf("im: send message error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to send message")
		return
	}

	// Real-time delivery to the counterpart. We scan existing messages to
	// identify the other party's user ID (the first message from the opposite
	// role gives us their ID).
	if h.hub != nil {
		go h.broadcastNewMessage(diagnosisID, senderRole, msg)
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    msg,
	})
}

// broadcastNewMessage looks up counter-party user IDs and emits an im.message
// event to them via the WebSocket hub.
func (h *Handler) broadcastNewMessage(diagnosisID, senderRole string, msg *Message) {
	msgs, err := h.svc.GetMessages(diagnosisID)
	if err != nil {
		return
	}

	seen := map[string]bool{}
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

	for _, m := range msgs {
		if m.SenderRole != senderRole && !seen[m.SenderID] {
			seen[m.SenderID] = true
			h.hub.BroadcastToUser(m.SenderID, "im.message", payload)
			// Send a push notification so the counterpart is alerted even
			// when they are in the background or have the modal closed.
			if h.pushSvc != nil {
				pushData := map[string]string{
					"type":        "im_message",
					"diagnosisId": diagnosisID,
				}
				var title, body string
				if senderRole == "user" {
					// Patient sent — notify physician
					title = "New message from patient"
					body = msg.SenderName + " sent you a message"
					h.pushSvc.SendToPhysician(context.Background(), m.SenderID, title, body, pushData)
				} else {
					// Physician sent — notify patient
					title = "New message from your doctor"
					body = msg.SenderName + " sent you a message"
					h.pushSvc.SendToUser(context.Background(), m.SenderID, title, body, pushData)
				}
			}
		}
	}
}

// ─── PUT /im/:diagnosisId/read ───────────────────────────────────────────────

// MarkRead stamps incoming messages as read for the calling user.
func (h *Handler) MarkRead(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")
	callerRole := role(c)

	if err := h.svc.MarkRead(diagnosisID, callerRole); err != nil {
		log.Printf("im: mark read error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to mark messages as read")
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ─── GET /im/:diagnosisId/unread ─────────────────────────────────────────────

// UnreadCount returns the number of unread messages for the calling user.
func (h *Handler) UnreadCount(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")
	callerRole := role(c)

	count, err := h.svc.UnreadCount(diagnosisID, callerRole)
	if err != nil {
		log.Printf("im: unread count error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to get unread count")
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"count": count}})
}
