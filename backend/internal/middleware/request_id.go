package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// RequestIDKey is the Gin context key under which the request ID is stored.
const RequestIDKey = "requestID"

// RequestID generates a unique per-request identifier, attaches it to the Gin
// context, and echoes it back in the X-Request-ID response header.
//
// STRIDE — Repudiation: every log line and audit record can be correlated to a
// single request without ambiguity.
//
// If the client (or an upstream proxy) already sends an X-Request-ID the value
// is reused for end-to-end traceability; it is capped at 64 characters to
// prevent header-injection attacks.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" || len(id) > 64 {
			b := make([]byte, 16)
			if _, err := rand.Read(b); err != nil {
				id = "00000000000000000000000000000000"
			} else {
				id = hex.EncodeToString(b)
			}
		}
		c.Set(RequestIDKey, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}
