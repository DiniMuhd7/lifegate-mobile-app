package middleware

import (
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger records method, path, status code, latency, client IP, authenticated
// user ID, and request ID for every request.
//
// STRIDE — Repudiation: the combination of request ID + user ID + IP creates an
// unambiguous audit trail that makes it hard for actors to deny having performed
// an action.
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		log.Printf("[req:%s] %s %s → %d in %s | ip=%s user=%s",
			contextStr(c, RequestIDKey),
			c.Request.Method,
			c.Request.URL.Path,
			c.Writer.Status(),
			time.Since(start),
			c.ClientIP(),
			contextStr(c, "userID"),
		)
	}
}

func contextStr(c *gin.Context, key string) string {
	if val, ok := c.Get(key); ok && val != nil {
		return fmt.Sprintf("%v", val)
	}
	return "-"
}
