package sessions

import (
	"context"
	"encoding/json"
	"fmt"

	redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
)

// abandonedTTLSeconds is the Redis TTL for abandoned-session fast-lookup keys (24 hours).
const abandonedTTLSeconds = 24 * 60 * 60

// Service wraps Repository with business logic and a Redis-backed fast lookup
// for abandoned sessions.
type Service struct {
	repo  *Repository
	redis *redisclient.Client
}

// NewService creates a new Service.
func NewService(repo *Repository, redis *redisclient.Client) *Service {
	return &Service{repo: repo, redis: redis}
}

func abandonedKey(userID string) string {
	return fmt.Sprintf("session:abandoned:%s", userID)
}

// Create creates a new chat session.
func (s *Service) Create(ctx context.Context, userID, title, category, mode string, messages json.RawMessage) (*Session, error) {
	return s.repo.Create(ctx, userID, title, category, mode, messages)
}

// List returns all sessions belonging to userID, newest first.
func (s *Service) List(ctx context.Context, userID string) ([]Session, error) {
	return s.repo.List(ctx, userID)
}

// Get returns a single session, verifying it belongs to userID.
func (s *Service) Get(ctx context.Context, id, userID string) (*Session, error) {
	return s.repo.Get(ctx, id, userID)
}

// Update patches the session and maintains the Redis abandoned-session cache.
func (s *Service) Update(ctx context.Context, id, userID string, in UpdateInput) (*Session, error) {
	session, err := s.repo.Update(ctx, id, userID, in)
	if err != nil {
		return nil, err
	}

	if in.Status != nil {
		switch *in.Status {
		case "abandoned":
			// Cache the session ID so GetIncomplete is a fast O(1) Redis lookup.
			_ = s.redis.SetEx(ctx, abandonedKey(userID), session.ID, abandonedTTLSeconds)
		case "active", "completed":
			// Session is no longer abandoned; remove the cache entry.
			_ = s.redis.Del(ctx, abandonedKey(userID))
		}
	}

	return session, nil
}

// Delete removes the session and clears any associated Redis state.
func (s *Service) Delete(ctx context.Context, id, userID string) error {
	// If this is the cached abandoned session, evict it from Redis first.
	if cachedID, err := s.redis.Get(ctx, abandonedKey(userID)); err == nil && cachedID == id {
		_ = s.redis.Del(ctx, abandonedKey(userID))
	}
	return s.repo.Delete(ctx, id, userID)
}

// GetIncomplete returns the user's most recent abandoned session.
// It checks Redis first for an O(1) fast path, then falls back to a DB scan.
// Returns (nil, nil) when no incomplete session exists.
func (s *Service) GetIncomplete(ctx context.Context, userID string) (*Session, error) {
	// Fast path: Redis cache stores the session ID with a 24-hour TTL.
	cachedID, err := s.redis.Get(ctx, abandonedKey(userID))
	if err == nil && cachedID != "" {
		session, dbErr := s.repo.Get(ctx, cachedID, userID)
		if dbErr == nil {
			return session, nil
		}
		// Stale cache entry (session was deleted) — clear and fall through.
		_ = s.redis.Del(ctx, abandonedKey(userID))
	}

	// Slow path: scan the DB for the latest abandoned session.
	return s.repo.GetIncomplete(ctx, userID)
}
