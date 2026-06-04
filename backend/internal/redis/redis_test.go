package redis

import (
	"context"
	"testing"
)

// All tests use a zero-value Client (nil rdb) to verify fail-open behaviour.
// These run without any Redis server.

func nilClient() *Client {
	return &Client{} // rdb is nil
}

func TestIncrWithTTL_NilClient_ReturnsZero(t *testing.T) {
	c := nilClient()
	count, err := c.IncrWithTTL(context.Background(), "key", 60)
	if err != nil {
		t.Errorf("IncrWithTTL on nil client: unexpected error: %v", err)
	}
	if count != 0 {
		t.Errorf("IncrWithTTL on nil client: got %d, want 0", count)
	}
}

func TestSetEx_NilClient_NoError(t *testing.T) {
	c := nilClient()
	if err := c.SetEx(context.Background(), "k", "v", 30); err != nil {
		t.Errorf("SetEx on nil client: unexpected error: %v", err)
	}
}

func TestGet_NilClient_ReturnsEmptyAndNil(t *testing.T) {
	c := nilClient()
	val, err := c.Get(context.Background(), "k")
	// nil client returns ("", redis.Nil) — the error is non-nil (redis.Nil sentinel)
	// Callers treat this as a cache miss, not a real error, so we just verify
	// that the returned value is empty.
	if val != "" {
		t.Errorf("Get on nil client: got %q, want empty string", val)
	}
	_ = err // redis.Nil is expected
}

func TestDel_NilClient_NoError(t *testing.T) {
	c := nilClient()
	if err := c.Del(context.Background(), "k"); err != nil {
		t.Errorf("Del on nil client: unexpected error: %v", err)
	}
}

func TestIncrWithTTL_NilClient_NeverBlocks(t *testing.T) {
	// Simulate 10 "increments" on a nil client — none should ever exceed maxAttempts
	// because they all return 0. This verifies the login rate limiter is fail-open.
	c := nilClient()
	const maxAttempts = 5
	for i := 0; i < 10; i++ {
		count, err := c.IncrWithTTL(context.Background(), "login:attempts:test@example.com", 900)
		if err != nil {
			t.Fatalf("iteration %d: unexpected error: %v", i, err)
		}
		if count > maxAttempts {
			t.Errorf("iteration %d: nil client returned count %d > maxAttempts %d (not fail-open)", i, count, maxAttempts)
		}
	}
}
