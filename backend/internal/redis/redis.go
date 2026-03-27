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
