package redis

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
rdb *redis.Client
}

func Connect(redisURL string) *Client {
opts, err := redis.ParseURL(redisURL)
if err != nil {
log.Printf("Warning: Failed to parse Redis URL: %v — Redis disabled", err)
return &Client{}
}

rdb := redis.NewClient(opts)
if err := rdb.Ping(context.Background()).Err(); err != nil {
log.Printf("Warning: Failed to connect to Redis: %v — Redis disabled", err)
return &Client{}
}

log.Println("Connected to Redis")
return &Client{rdb: rdb}
}

func (c *Client) SetEx(ctx context.Context, key, value string, ttlSeconds int) error {
if c.rdb == nil {
return nil
}
return c.rdb.Set(ctx, key, value, time.Duration(ttlSeconds)*time.Second).Err()
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
if c.rdb == nil {
return "", redis.Nil
}
return c.rdb.Get(ctx, key).Result()
}

func (c *Client) Del(ctx context.Context, key string) error {
if c.rdb == nil {
return nil
}
return c.rdb.Del(ctx, key).Err()
}

// GetInt64 returns the integer value stored at key, or 0 if the key does not
// exist or Redis is unavailable.
func (c *Client) GetInt64(ctx context.Context, key string) (int64, error) {
	if c.rdb == nil {
		return 0, nil
	}
	val, err := c.rdb.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

// IncrWithTTL atomically increments the integer at key and, on the first
// increment (count == 1), sets a TTL to enforce a fixed-window expiry.
// Returns the new count. Returns 0 if Redis is unavailable (fail-open).
func (c *Client) IncrWithTTL(ctx context.Context, key string, ttlSeconds int) (int64, error) {
if c.rdb == nil {
return 0, nil
}
count, err := c.rdb.Incr(ctx, key).Result()
if err != nil {
return 0, err
}
if count == 1 {
// Only set TTL on first write so the window is fixed, not sliding.
c.rdb.Expire(ctx, key, time.Duration(ttlSeconds)*time.Second)
}
return count, nil
}

// Ping checks whether the Redis connection is alive.
// Returns true if Redis is responsive, false otherwise (including when disabled).
func (c *Client) Ping(ctx context.Context) bool {
	if c.rdb == nil {
		return false
	}
	return c.rdb.Ping(ctx).Err() == nil
}

// SetJSON serialises v as JSON and stores it with the given TTL.
// Silently succeeds when Redis is unavailable (cache-optional pattern).
func (c *Client) SetJSON(ctx context.Context, key string, v interface{}, ttlSeconds int) error {
	if c.rdb == nil {
		return nil
	}
	b, err := marshalJSON(v)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, key, b, time.Duration(ttlSeconds)*time.Second).Err()
}

// GetJSON retrieves the value at key and unmarshals it into dst.
// Returns (false, nil) when the key doesn't exist or Redis is unavailable.
func (c *Client) GetJSON(ctx context.Context, key string, dst interface{}) (bool, error) {
	if c.rdb == nil {
		return false, nil
	}
	raw, err := c.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, unmarshalJSON(raw, dst)
}

// InvalidatePrefix deletes all keys that start with the given prefix using SCAN.
// This is safe for large key spaces and does not block the Redis server.
func (c *Client) InvalidatePrefix(ctx context.Context, prefix string) {
	if c.rdb == nil {
		return
	}
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, prefix+"*", 100).Result()
		if err != nil {
			return
		}
		if len(keys) > 0 {
			c.rdb.Del(ctx, keys...)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}

func marshalJSON(v interface{}) ([]byte, error)   { return json.Marshal(v) }
func unmarshalJSON(b []byte, v interface{}) error { return json.Unmarshal(b, v) }
