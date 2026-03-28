package redis

import (
"context"
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
