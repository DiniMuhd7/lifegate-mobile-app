package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// rateBucket tracks request counts within a fixed window for a single IP.
type rateBucket struct {
	mu    sync.Mutex
	count int64
	reset int64 // Unix timestamp when the current window expires
}

// globalBuckets holds per-IP rate-limit state across all requests.
var globalBuckets sync.Map

func init() {
	// Periodically evict buckets whose window has long expired so the map
	// does not grow without bound in long-running deployments.
	go func() {
		t := time.NewTicker(5 * time.Minute)
		for range t.C {
			now := time.Now().Unix()
			globalBuckets.Range(func(key, val any) bool {
				b := val.(*rateBucket)
				b.mu.Lock()
				stale := now > b.reset+300 // 5-minute grace period
				b.mu.Unlock()
				if stale {
					globalBuckets.Delete(key)
				}
				return true
			})
		}
	}()
}

// RateLimit returns a Gin middleware that limits each client IP to maxRequests
// within windowSecs seconds using a fixed-window counter.
//
// STRIDE — Denial of Service: enforces a request ceiling so that no single
// client can exhaust server resources.
//
// Excess requests are rejected with HTTP 429 and a Retry-After header.
// Standard X-RateLimit-* response headers are set on every response so
// well-behaved clients can self-throttle.
func RateLimit(maxRequests, windowSecs int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now().Unix()

		val, _ := globalBuckets.LoadOrStore(ip, &rateBucket{reset: now + windowSecs})
		b := val.(*rateBucket)

		b.mu.Lock()
		if now >= b.reset {
			b.count = 0
			b.reset = now + windowSecs
		}
		b.count++
		count := b.count
		reset := b.reset
		b.mu.Unlock()

		remaining := maxRequests - count
		if remaining < 0 {
			remaining = 0
		}
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", maxRequests))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", reset))

		if count > maxRequests {
			retryAfter := reset - now
			if retryAfter < 0 {
				retryAfter = 0
			}
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "Too many requests — please slow down",
			})
			return
		}
		c.Next()
	}
}
