package middleware

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS returns a middleware that sets CORS headers.
// In production (GIN_MODE=release), it restricts origins to ALLOWED_ORIGINS env var.
// In development, it allows all origins.
func CORS() gin.HandlerFunc {
	allowedOrigins := getAllowedOrigins()
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allow := resolveOrigin(origin, allowedOrigins)
		if allow != "" {
			c.Header("Access-Control-Allow-Origin", allow)
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, Accept")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func getAllowedOrigins() []string {
	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw == "" {
		return nil // allow all in development
	}
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}

func resolveOrigin(origin string, allowed []string) string {
	if len(allowed) == 0 {
		return "*"
	}
	for _, a := range allowed {
		if a == "*" || a == origin || wildcardOriginMatch(a, origin) {
			return origin
		}
	}
	return ""
}

func wildcardOriginMatch(pattern, origin string) bool {
	if !strings.Contains(pattern, "://*.") {
		return false
	}
	prefix, suffix, ok := strings.Cut(pattern, "*")
	return ok && strings.HasPrefix(origin, prefix) && strings.HasSuffix(origin, suffix)
}
