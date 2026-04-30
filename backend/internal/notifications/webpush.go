package notifications

// Web Push (RFC 8292) delivery alongside the existing Expo push channel.
// Web push subscriptions are stored in Postgres (not Redis) so they survive
// Redis flushes and can be queried by user/physician ID.
//
// Schema (created by migration 033):
//
//	web_push_subscriptions (
//	    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//	    user_id      TEXT NOT NULL,
//	    endpoint     TEXT NOT NULL UNIQUE,
//	    p256dh       TEXT NOT NULL,
//	    auth_key     TEXT NOT NULL,
//	    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
//	)

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

const webPushHTTPTimeout = 10 * time.Second

// WebPushSubscription mirrors the JSON body sent from the browser.
type WebPushSubscription struct {
	Endpoint string `json:"endpoint" binding:"required"`
	Keys     struct {
		P256dh string `json:"p256dh" binding:"required"`
		Auth   string `json:"auth"   binding:"required"`
	} `json:"keys" binding:"required"`
}

// WebPushService handles storage and delivery of Web Push notifications.
type WebPushService struct {
	db          *sql.DB
	vapidPub    string
	vapidPriv   string
	vapidSub    string
}

// NewWebPushService creates a WebPushService. Returns nil (no-op) when VAPID
// keys are not configured so the rest of the app can treat it as optional.
func NewWebPushService(db *sql.DB, vapidPub, vapidPriv, vapidSub string) *WebPushService {
	if vapidPub == "" || vapidPriv == "" {
		log.Println("[webpush] VAPID keys not configured — web push disabled")
		return nil
	}
	return &WebPushService{
		db:        db,
		vapidPub:  vapidPub,
		vapidPriv: vapidPriv,
		vapidSub:  vapidSub,
	}
}

// VAPIDPublicKey returns the VAPID public key for the client to use when
// calling PushManager.subscribe().
func (w *WebPushService) VAPIDPublicKey() string {
	return w.vapidPub
}

// SaveSubscription upserts a browser push subscription for a user.
func (w *WebPushService) SaveSubscription(ctx context.Context, userID string, sub WebPushSubscription) error {
	_, err := w.db.ExecContext(ctx, `
		INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth_key)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (endpoint) DO UPDATE
		    SET user_id  = EXCLUDED.user_id,
		        p256dh   = EXCLUDED.p256dh,
		        auth_key = EXCLUDED.auth_key`,
		userID, sub.Endpoint, sub.Keys.P256dh, sub.Keys.Auth)
	return err
}

// DeleteSubscription removes a browser push subscription by endpoint.
func (w *WebPushService) DeleteSubscription(ctx context.Context, endpoint string) error {
	_, err := w.db.ExecContext(ctx,
		`DELETE FROM web_push_subscriptions WHERE endpoint = $1`, endpoint)
	return err
}

// webPushPayload is what browsers receive in the service worker push event.
type webPushPayload struct {
	Title string            `json:"title"`
	Body  string            `json:"body"`
	Data  map[string]string `json:"data,omitempty"`
}

// SendToUser sends a web push notification to all browser subscriptions
// registered for userID. Expired or invalid subscriptions are pruned silently.
func (w *WebPushService) SendToUser(ctx context.Context, userID, title, body string, data map[string]string) {
	w.sendToSubscribers(ctx, `SELECT endpoint, p256dh, auth_key FROM web_push_subscriptions WHERE user_id = $1`, userID, title, body, data)
}

// BroadcastToAllPhysicians sends a web push to all physician subscriptions.
func (w *WebPushService) BroadcastToAllPhysicians(ctx context.Context, physicianIDs []string, title, body string, data map[string]string) {
	for _, id := range physicianIDs {
		w.sendToSubscribers(ctx, `SELECT endpoint, p256dh, auth_key FROM web_push_subscriptions WHERE user_id = $1`, id, title, body, data)
	}
}

func (w *WebPushService) sendToSubscribers(ctx context.Context, query, arg, title, body string, data map[string]string) {
	rows, err := w.db.QueryContext(ctx, query, arg)
	if err != nil {
		log.Printf("[webpush] query error: %v", err)
		return
	}
	defer rows.Close()

	payload, _ := json.Marshal(webPushPayload{Title: title, Body: body, Data: data})

	for rows.Next() {
		var endpoint, p256dh, authKey string
		if err := rows.Scan(&endpoint, &p256dh, &authKey); err != nil {
			continue
		}
		go w.deliver(ctx, endpoint, p256dh, authKey, payload)
	}
}

func (w *WebPushService) deliver(ctx context.Context, endpoint, p256dh, authKey string, payload []byte) {
	sub := &webpush.Subscription{
		Endpoint: endpoint,
		Keys: webpush.Keys{
			P256dh: p256dh,
			Auth:   authKey,
		},
	}

	resp, err := webpush.SendNotificationWithContext(ctx, payload, sub, &webpush.Options{
		VAPIDPublicKey:  w.vapidPub,
		VAPIDPrivateKey: w.vapidPriv,
		Subscriber:      w.vapidSub,
		TTL:             86400,
		HTTPClient:      nil, // uses http.DefaultClient
	})
	if err != nil {
		log.Printf("[webpush] delivery error for %s: %v", endpoint, err)
		return
	}
	defer resp.Body.Close()

	// 410 Gone / 404 = subscription expired; 201 = success.
	if resp.StatusCode == 410 || resp.StatusCode == 404 {
		log.Printf("[webpush] pruning expired subscription: %s", endpoint)
		_ = w.DeleteSubscription(context.Background(), endpoint)
	} else if resp.StatusCode >= 300 {
		log.Printf("[webpush] push gateway returned HTTP %d for %s", resp.StatusCode, endpoint)
	}
}
