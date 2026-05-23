// Package calls handles real-time voice and video call signaling between
// patients and physicians. It uses WebRTC signaling (offer/answer/ICE) relayed
// through the existing WebSocket hub and stores active sessions in-memory.
package calls

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pion/webrtc/v3"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
)

// httpClient is shared across all OpenAI API calls originating from this package.
var httpClient = &http.Client{Timeout: 90 * time.Second}

// ── Interfaces ────────────────────────────────────────────────────────────────

// Broadcaster is satisfied by the WebSocket hub.
type Broadcaster interface {
	BroadcastToUser(userID, event string, data []byte)
}

// PushNotifier is satisfied by the push-notification service.
type PushNotifier interface {
	SendToUser(ctx context.Context, userID, title, body string, data map[string]string)
	SendToPhysician(ctx context.Context, physicianID, title, body string, data map[string]string)
}

// ── Session types ─────────────────────────────────────────────────────────────

const (
	statusRinging = "ringing"
	statusActive  = "active"
	statusEnded   = "ended"

	// ringTimeout is how long the caller waits before an unanswered call is
	// automatically ended.  The mobile client should mirror this value so its
	// ring-tone stops at the same time.
	ringTimeout = 45 * time.Second
)

type callSession struct {
	CallID      string
	CallerID    string
	CallerName  string
	CalleeID    string
	CalleeName  string
	CallType    string // "voice" | "video"
	DiagnosisID string
	Status      string
	CreatedAt   time.Time
}

// ── Handler ───────────────────────────────────────────────────────────────────

// Handler manages call signaling endpoints.
type Handler struct {
	hub          Broadcaster
	push         PushNotifier
	db           *sql.DB
	sessions     sync.Map // callID → *callSession
	pionSessions sync.Map // callID → *openClawSession (AI physician calls)

	// OpenClaw AI config
	// provider is the shared AI provider instance (same as EDIS/OpenClaw IM) so
	// the model name is always in sync. openAIKey is kept separately because
	// Whisper (STT) and TTS use OpenAI audio endpoints regardless of which chat
	// provider is active.
	agentsDir  string
	provider   ai.AIProvider
	openAIKey  string
}

// NewHandler creates a new call handler.
// provider must be the same ai.AIProvider instance used by EDIS and OpenClaw IM
// so that the model name is guaranteed to be consistent across all AI subsystems.
// openAIKey is the raw OpenAI API key used exclusively for Whisper STT and TTS
// (audio endpoints that are always OpenAI-specific regardless of the chat provider).
func NewHandler(hub Broadcaster, push PushNotifier, db *sql.DB, agentsDir string, provider ai.AIProvider, openAIKey string) *Handler {
	return &Handler{
		hub:       hub,
		push:      push,
		db:        db,
		agentsDir: agentsDir,
		provider:  provider,
		openAIKey: openAIKey,
	}
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Offer — caller sends an SDP offer and initiates the call.
// The callee is derived from the diagnosisId so no explicit callee_id is needed.
func (h *Handler) Offer(c *gin.Context) {
	callerID := uid(c)
	if callerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		DiagnosisID string `json:"diagnosis_id" binding:"required"`
		CallType    string `json:"call_type" binding:"required"` // "voice" | "video"
		SDPOffer    string `json:"sdp_offer" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.CallType != "voice" && req.CallType != "video" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "call_type must be 'voice' or 'video'"})
		return
	}

	// Resolve participants from the diagnosis.
	patientID, physicianID, err := h.getParticipants(req.DiagnosisID)
	if err != nil || patientID == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "diagnosis not found"})
		return
	}

	// Determine callee.
	calleeID := physicianID
	if callerID == physicianID {
		calleeID = patientID
	}
	if calleeID == "" || calleeID == callerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot call self or unassigned diagnosis"})
		return
	}

	callerName := h.lookupName(callerID)
	calleeName := h.lookupName(calleeID)
	calleeAvatarURL := h.lookupAvatarURL(calleeID)
	callerAvatarURL := h.lookupAvatarURL(callerID)

	// Check if callee is an OpenClaw AI physician — auto-reject if so.
	isOpenClaw, _ := h.isOpenClawPhysician(calleeID)

	session := &callSession{
		CallID:      newCallID(),
		CallerID:    callerID,
		CallerName:  callerName,
		CalleeID:    calleeID,
		CalleeName:  calleeName,
		CallType:    req.CallType,
		DiagnosisID: req.DiagnosisID,
		Status:      statusRinging,
		CreatedAt:   time.Now(),
	}
	h.sessions.Store(session.CallID, session)

	if isOpenClaw {
		// Answer the call on behalf of the OpenClaw AI physician using Pion WebRTC.
		agentSlug, err := h.getOpenClawSlug(calleeID)
		if err != nil || agentSlug == "" {
			h.sessions.Delete(session.CallID)
			rejPayload, _ := json.Marshal(map[string]string{"call_id": session.CallID, "reason": "unavailable"})
			h.hub.BroadcastToUser(callerID, "call.rejected", rejPayload)
			c.JSON(http.StatusOK, gin.H{"data": gin.H{"call_id": session.CallID}, "message": calleeName + " is currently unavailable."})
			return
		}

		pionSess, answer, err := newOpenClawSession(
			c.Request.Context(),
			h.hub, h.db,
			h.provider, h.openAIKey,
			session, agentSlug, h.agentsDir,
			req.SDPOffer,
		)
		if err != nil {
			h.sessions.Delete(session.CallID)
			rejPayload, _ := json.Marshal(map[string]string{"call_id": session.CallID, "reason": "unavailable"})
			h.hub.BroadcastToUser(callerID, "call.rejected", rejPayload)
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI physician unavailable: " + err.Error()})
			return
		}

		h.pionSessions.Store(session.CallID, pionSess)
		session.Status = statusActive

		// Send the SDP answer to the patient BEFORE starting the audio pipeline.
		// This ensures the patient's RTCPeerConnection calls setRemoteDescription
		// before any trickle ICE candidates arrive, avoiding a race where
		// addIceCandidate fires before the remote description is set.
		answerPayload, _ := json.Marshal(map[string]string{
			"call_id":    session.CallID,
			"sdp_answer": answer.SDP,
		})
		h.hub.BroadcastToUser(callerID, "call.answered", answerPayload)

		// Wire ICE callbacks and start audio pipeline AFTER sending the answer.
		pionSess.Start()

		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"call_id":           session.CallID,
			"callee_name":       calleeName,
			"callee_avatar_url": calleeAvatarURL,
		}})
		return
	}

	// Broadcast call.ringing to the callee.
	ringPayload, _ := json.Marshal(map[string]interface{}{
		"call_id":          session.CallID,
		"caller_id":        callerID,
		"caller_name":      callerName,
		"caller_avatar_url": callerAvatarURL,
		"call_type":        req.CallType,
		"diagnosis_id":     req.DiagnosisID,
		"sdp_offer":        req.SDPOffer,
	})
	h.hub.BroadcastToUser(calleeID, "call.ringing", ringPayload)

	// Push notification to callee.
	if h.push != nil {
		label := "voice call"
		if req.CallType == "video" {
			label = "video call"
		}
		notifData := map[string]string{
			"type":     "incoming_call",
			"callId":   session.CallID,
			"callType": req.CallType,
		}
		h.push.SendToUser(
			c.Request.Context(), calleeID,
			"Incoming Call",
			fmt.Sprintf("%s is calling you (%s)", callerName, label),
			notifData,
		)
	}

	// Auto-expire unanswered calls after ringTimeout so the caller is not left
	// ringing indefinitely when the callee is offline or ignores the call.
	go h.expireRingingCall(session, callerName)

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"call_id":           session.CallID,
		"callee_name":       calleeName,
		"callee_avatar_url": calleeAvatarURL,
	}})
}

// Answer — callee accepts the call and sends their SDP answer.
func (h *Handler) Answer(c *gin.Context) {
	calleeID := uid(c)
	if calleeID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		CallID    string `json:"call_id" binding:"required"`
		SDPAnswer string `json:"sdp_answer" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	v, ok := h.sessions.Load(req.CallID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "call not found"})
		return
	}
	session := v.(*callSession)
	if session.CalleeID != calleeID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not the callee for this call"})
		return
	}

	session.Status = statusActive

	answerPayload, _ := json.Marshal(map[string]string{
		"call_id":    req.CallID,
		"sdp_answer": req.SDPAnswer,
	})
	h.hub.BroadcastToUser(session.CallerID, "call.answered", answerPayload)

	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

// Reject — callee declines an incoming call.
func (h *Handler) Reject(c *gin.Context) {
	callID := c.Param("callId")

	v, ok := h.sessions.Load(callID)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"data": "ok"})
		return
	}
	session := v.(*callSession)
	session.Status = statusEnded
	h.sessions.Delete(callID)

	payload, _ := json.Marshal(map[string]string{"call_id": callID})
	h.hub.BroadcastToUser(session.CallerID, "call.rejected", payload)

	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

// End — either party ends an active call.
func (h *Handler) End(c *gin.Context) {
	callID := c.Param("callId")
	senderID := uid(c)

	// Tear down AI physician session if present.
	// SaveTranscript must be called before Close so the history is still intact.
	if v, ok := h.pionSessions.LoadAndDelete(callID); ok {
		ocs := v.(*openClawSession)
		ocs.SaveTranscript()
		ocs.Close()
	}

	v, ok := h.sessions.Load(callID)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"data": "ok"})
		return
	}
	session := v.(*callSession)
	session.Status = statusEnded
	h.sessions.Delete(callID)

	payload, _ := json.Marshal(map[string]string{"call_id": callID})

	// Notify the other party.
	if senderID != session.CallerID {
		h.hub.BroadcastToUser(session.CallerID, "call.ended", payload)
	}
	if senderID != session.CalleeID {
		h.hub.BroadcastToUser(session.CalleeID, "call.ended", payload)
	}

	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

// IceCandidate — relay a WebRTC ICE candidate to the remote peer.
// If the call is with an OpenClaw AI physician, deliver the candidate directly
// to the Pion PeerConnection instead of relaying via hub.
func (h *Handler) IceCandidate(c *gin.Context) {
	callID := c.Param("callId")
	senderID := uid(c)

	// Check if this is an AI physician call first.
	if v, ok := h.pionSessions.Load(callID); ok {
		pionSess := v.(*openClawSession)
		var req struct {
			Candidate webrtc.ICECandidateInit `json:"candidate"`
		}
		if err := c.ShouldBindJSON(&req); err == nil {
			_ = pionSess.AddICECandidate(req.Candidate)
		}
		c.JSON(http.StatusOK, gin.H{"data": "ok"})
		return
	}

	var req struct {
		Candidate interface{} `json:"candidate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	v, ok := h.sessions.Load(callID)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"data": "ok"})
		return
	}
	session := v.(*callSession)

	// Forward to the other party.
	peerID := session.CalleeID
	if senderID == session.CalleeID {
		peerID = session.CallerID
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"call_id":   callID,
		"candidate": req.Candidate,
	})
	h.hub.BroadcastToUser(peerID, "call.ice-candidate", payload)

	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (h *Handler) getParticipants(diagnosisID string) (patientID, physicianID string, err error) {
	const q = `SELECT COALESCE(user_id::text,''), COALESCE(physician_id::text,'')
	           FROM diagnoses WHERE id = $1`
	err = h.db.QueryRow(q, diagnosisID).Scan(&patientID, &physicianID)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return patientID, physicianID, err
}

func (h *Handler) lookupName(userID string) string {
	var name string
	if err := h.db.QueryRow(`SELECT name FROM users WHERE id = $1`, userID).Scan(&name); err != nil || name == "" {
		return "Unknown"
	}
	return name
}

// lookupAvatarURL returns the user's profile photo URL, or "" if not set.
func (h *Handler) lookupAvatarURL(userID string) string {
	var url *string
	if err := h.db.QueryRow(`SELECT avatar_url FROM users WHERE id = $1`, userID).Scan(&url); err != nil || url == nil {
		return ""
	}
	return *url
}

func (h *Handler) isOpenClawPhysician(userID string) (bool, error) {
	var slug *string
	err := h.db.QueryRow(`SELECT openclaw_agent_slug FROM users WHERE id = $1`, userID).Scan(&slug)
	if err != nil {
		return false, err
	}
	return slug != nil && *slug != "", nil
}

// getOpenClawSlug returns the openclaw_agent_slug for the given user.
func (h *Handler) getOpenClawSlug(userID string) (string, error) {
	var slug string
	err := h.db.QueryRow(`SELECT COALESCE(openclaw_agent_slug,'') FROM users WHERE id = $1`, userID).Scan(&slug)
	return slug, err
}

func uid(c *gin.Context) string {
	v, _ := c.Get("userID")
	s, _ := v.(string)
	return s
}

func newCallID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("CALL-%d", time.Now().UnixNano())
	}
	return "CALL-" + hex.EncodeToString(b)
}

// expireRingingCall waits ringTimeout and, if the call is still in the ringing
// state, ends it automatically.  This prevents the caller from ringing
// indefinitely when the callee is offline, misses the notification, or
// simply does not answer.
func (h *Handler) expireRingingCall(session *callSession, callerName string) {
	time.Sleep(ringTimeout)

	// LoadAndDelete is atomic — if it returns false the call was already
	// answered, rejected, or ended by one of the other endpoints.
	v, ok := h.sessions.LoadAndDelete(session.CallID)
	if !ok {
		return
	}
	s := v.(*callSession)

	// If the session was answered between the Sleep and the LoadAndDelete
	// (extremely unlikely but possible), restore it and do nothing.
	if s.Status != statusRinging {
		h.sessions.Store(session.CallID, s)
		return
	}

	s.Status = statusEnded

	// Tell the caller the call was not answered.
	endedPayload, _ := json.Marshal(map[string]string{
		"call_id": session.CallID,
		"reason":  "no_answer",
	})
	h.hub.BroadcastToUser(s.CallerID, "call.ended", endedPayload)

	// Send a missed-call push notification to the callee.
	if h.push != nil {
		label := s.CallType
		h.push.SendToUser(
			context.Background(), s.CalleeID,
			"Missed Call",
			fmt.Sprintf("You missed a %s call from %s", label, callerName),
			map[string]string{
				"type":     "missed_call",
				"callId":   s.CallID,
				"callType": s.CallType,
			},
		)
	}
}
