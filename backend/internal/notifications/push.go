// Package notifications provides push notification delivery via the Expo Push API.
// Physician push tokens are stored in Redis with a 30-day TTL and sent to the
// expo.host/--/api/v2/push/send HTTPS endpoint which handles both FCM (Android)
// and APNs (iOS) without requiring native SDKs.
package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
)

const (
	expoPushURL          = "https://exp.host/--/api/v2/push/send"
	tokenKeyPrefix       = "pushtoken:physician:"
	userTokenKeyPrefix   = "pushtoken:user:"
	tokenTTLSeconds      = 30 * 24 * 60 * 60 // 30 days
	httpTimeout          = 5 * time.Second
)

// Service manages physician push token storage and push delivery.
type Service struct {
	redis *redisclient.Client
}

// NewService creates a new push notification service.
func NewService(redis *redisclient.Client) *Service {
	return &Service{redis: redis}
}

// RegisterToken stores a physician's Expo push token in Redis.
func (s *Service) RegisterToken(ctx context.Context, physicianID, token string) error {
	return s.redis.SetEx(ctx, tokenKeyPrefix+physicianID, token, tokenTTLSeconds)
}

// GetToken retrieves a physician's push token from Redis (empty string if not set).
func (s *Service) GetToken(ctx context.Context, physicianID string) string {
	token, _ := s.redis.Get(ctx, tokenKeyPrefix+physicianID)
	return token
}

// RegisterUserToken stores any user's Expo push token under a role-agnostic key.
// This is used by patients to receive notifications when their case is reviewed.
func (s *Service) RegisterUserToken(ctx context.Context, userID, token string) error {
	return s.redis.SetEx(ctx, userTokenKeyPrefix+userID, token, tokenTTLSeconds)
}

// GetUserToken retrieves a user's push token (empty string if not registered).
func (s *Service) GetUserToken(ctx context.Context, userID string) string {
	token, _ := s.redis.Get(ctx, userTokenKeyPrefix+userID)
	return token
}

// SendToUser sends a push notification to any registered user (patient or physician).
// Delivery failures are logged but never propagated to the caller.
func (s *Service) SendToUser(ctx context.Context, userID, title, body string, data map[string]string) {
	token := s.GetUserToken(ctx, userID)
	if token == "" {
		return
	}
	s.send(ctx, []pushMessage{{To: token, Title: title, Body: body, Data: data}})
}

// SendToPhysician sends a push notification to a single physician if they have a
// registered token.  Delivery failures are logged but not propagated.
func (s *Service) SendToPhysician(ctx context.Context, physicianID, title, body string, data map[string]string) {
	token := s.GetToken(ctx, physicianID)
	if token == "" {
		return
	}
	s.send(ctx, []pushMessage{{To: token, Title: title, Body: body, Data: data}})
}

// BroadcastToAll sends a push notification to every physician that has a push
// token registered.  physicianIDs may be empty — in that case nothing is sent.
func (s *Service) BroadcastToAll(ctx context.Context, physicianIDs []string, title, body string, data map[string]string) {
	var msgs []pushMessage
	for _, id := range physicianIDs {
		token := s.GetToken(ctx, id)
		if token == "" {
			continue
		}
		msgs = append(msgs, pushMessage{To: token, Title: title, Body: body, Data: data})
	}
	if len(msgs) > 0 {
		s.send(ctx, msgs)
	}
}

// BroadcastToAllPhysicians sends a push notification to every physician that
// currently has a push token registered in Redis.  It uses a non-blocking SCAN
// so it is safe regardless of fleet size.  Delivery failures are logged only.
func (s *Service) BroadcastToAllPhysicians(ctx context.Context, title, body string, data map[string]string) {
	keys, err := s.redis.ScanKeys(ctx, tokenKeyPrefix+"*")
	if err != nil || len(keys) == 0 {
		return
	}
	msgs := make([]pushMessage, 0, len(keys))
	for _, key := range keys {
		token, _ := s.redis.Get(ctx, key)
		if token == "" {
			continue
		}
		msgs = append(msgs, pushMessage{To: token, Title: title, Body: body, Data: data})
	}
	if len(msgs) > 0 {
		s.send(ctx, msgs)
	}
}

// ─── Internal ────────────────────────────────────────────────────────────────

type pushMessage struct {
	To    string            `json:"to"`
	Title string            `json:"title"`
	Body  string            `json:"body"`
	Data  map[string]string `json:"data,omitempty"`
}

func (s *Service) send(ctx context.Context, msgs []pushMessage) {
	payload, err := json.Marshal(msgs)
	if err != nil {
		log.Printf("[push] marshal error: %v", err)
		return
	}

	reqCtx, cancel := context.WithTimeout(ctx, httpTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, expoPushURL, bytes.NewReader(payload))
	if err != nil {
		log.Printf("[push] create request error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[push] delivery error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("[push] Expo API returned HTTP %d", resp.StatusCode)
		return
	}
	log.Printf("[push] sent %d notification(s)", len(msgs))
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// RegisterTokenRequest is the expected JSON body for POST /physician/push-token.
type RegisterTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// BuildRegisterHandler returns a Gin handler that stores a physician's push token.
func (s *Service) BuildRegisterHandler() func(physicianID, token string) error {
	return func(physicianID, token string) error {
		if len(token) < 10 {
			return fmt.Errorf("invalid push token")
		}
		return s.RegisterToken(context.Background(), physicianID, token)
	}
}
