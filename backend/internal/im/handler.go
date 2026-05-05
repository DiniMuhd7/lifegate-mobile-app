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
// Returns "Unknown User" if the lookup fails.
func (h *Handler) lookupName(userID string) string {
	var name string
	err := h.db.QueryRow(`SELECT name FROM users WHERE id = $1`, userID).Scan(&name)
	if err != nil || name == "" {
		return "Unknown User"
	}
	return name
}

// verifyParticipant checks if the caller (userID) is a participant in the diagnosis.
// Returns (true, nil) if authorized; (false, error) if not.
func (h *Handler) verifyParticipant(diagnosisID, userID string) (bool, error) {
	patientID, physicianID, err := h.svc.GetParticipants(diagnosisID)
	if err != nil {
		return false, err
	}
	if patientID == "" {
		return false, errors.New("diagnosis not found")
	}
	if userID != patientID && userID != physicianID {
		return false, errors.New("access denied: user is not a participant in this conversation")
	}
	return true, nil
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

	// Verify caller is a participant in this diagnosis
	ok, err := h.verifyParticipant(diagnosisID, callerID)
	if err != nil {
		log.Printf("im: participant verify error: %v", err)
		respondError(c, http.StatusForbidden, "Access denied")
		return
	}
	if !ok {
		respondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

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
		// Check if there are any unread messages from the other side.
		// If so, notify the sender(s) once that messages have been read.
		hasUnread := false
		var senderID string
		for _, m := range msgs {
			if m.SenderRole != callerRole && m.ReadAt == nil {
				hasUnread = true
				senderID = m.SenderID
				break
			}
		}
		if hasUnread && senderID != "" {
			payload, _ := json.Marshal(map[string]string{
				"diagnosis_id": diagnosisID,
				"reader_id":    callerID,
				"reader_role":  callerRole,
			})
			h.hub.BroadcastToUser(senderID, "im.read_receipt", payload)
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
func (h *Handler) SendMessage(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")

	var req sendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "content is required")
		return
	}

	senderID := uid(c)
	senderRole := role(c)

	// Verify caller is a participant in this diagnosis
	ok, err := h.verifyParticipant(diagnosisID, senderID)
	if err != nil {
		log.Printf("im: participant verify error: %v", err)
		respondError(c, http.StatusForbidden, "Access denied")
		return
	}
	if !ok {
		respondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

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

	// Real-time delivery + push notification to the counterpart.
	// Runs in a goroutine so the HTTP response is not delayed.
	go h.broadcastNewMessage(diagnosisID, senderRole, senderID, msg)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    msg,
	})
}

// broadcastNewMessage looks up the counterpart's userID directly from the
// diagnoses table (reliable even when no messages exist yet) and emits an
// im.message WS event plus an Expo push notification.
func (h *Handler) broadcastNewMessage(diagnosisID, senderRole, senderID string, msg *Message) {
	patientID, physicianID, err := h.svc.GetParticipants(diagnosisID)
	if err != nil || patientID == "" {
		log.Printf("im: broadcastNewMessage: failed to get participants for %s: %v", diagnosisID, err)
		return
	}

	// Counterpart is whoever is NOT the sender.
	var counterpartID string
	if senderRole == "user" {
		counterpartID = physicianID
	} else {
		counterpartID = patientID
	}
	if counterpartID == "" {
		return // diagnosis not yet assigned to both parties
	}

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

	if h.hub != nil {
		h.hub.BroadcastToUser(counterpartID, "im.message", payload)
	}

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
			h.pushSvc.SendToPhysician(context.Background(), counterpartID, title, body, pushData)
		} else {
			// Physician sent — notify patient
			title = "New message from your doctor"
			body = msg.SenderName + " sent you a message"
			h.pushSvc.SendToUser(context.Background(), counterpartID, title, body, pushData)
		}
	}
}

// ─── PUT /im/:diagnosisId/read ───────────────────────────────────────────────

// MarkRead stamps incoming messages as read for the calling user.
func (h *Handler) MarkRead(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")
	callerRole := role(c)
	callerID := uid(c)

	// Verify caller is a participant in this diagnosis
	ok, err := h.verifyParticipant(diagnosisID, callerID)
	if err != nil {
		log.Printf("im: participant verify error: %v", err)
		respondError(c, http.StatusForbidden, "Access denied")
		return
	}
	if !ok {
		respondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

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
	callerID := uid(c)

	// Verify caller is a participant in this diagnosis
	ok, err := h.verifyParticipant(diagnosisID, callerID)
	if err != nil {
		log.Printf("im: participant verify error: %v", err)
		respondError(c, http.StatusForbidden, "Access denied")
		return
	}
	if !ok {
		respondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	count, err := h.svc.UnreadCount(diagnosisID, callerRole)
	if err != nil {
		log.Printf("im: unread count error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to get unread count")
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"count": count}})
}

// ─── POST /im/:diagnosisId/typing ───────────────────────────────────────────

type typingRequest struct {
	Typing bool `json:"typing" binding:"required"`
}

// SendTypingIndicator broadcasts a typing indicator to the counterpart.
func (h *Handler) SendTypingIndicator(c *gin.Context) {
	diagnosisID := c.Param("diagnosisId")
	callerID := uid(c)

	var req typingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "typing status is required")
		return
	}

	// Verify caller is a participant in this diagnosis
	ok, err := h.verifyParticipant(diagnosisID, callerID)
	if err != nil {
		log.Printf("im: participant verify error: %v", err)
		respondError(c, http.StatusForbidden, "Access denied")
		return
	}
	if !ok {
		respondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	if h.hub == nil {
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	// Broadcast typing status to the counterpart
	patientID, physicianID, err := h.svc.GetParticipants(diagnosisID)
	if err != nil {
		log.Printf("im: get participants error: %v", err)
		respondError(c, http.StatusInternalServerError, "Failed to send typing indicator")
		return
	}

	var counterpartID string
	if callerID == patientID {
		counterpartID = physicianID
	} else {
		counterpartID = patientID
	}

	if counterpartID != "" {
		payload, _ := json.Marshal(map[string]interface{}{
			"diagnosis_id": diagnosisID,
			"typing":       req.Typing,
		})
		h.hub.BroadcastToUser(counterpartID, "im.typing", payload)
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
