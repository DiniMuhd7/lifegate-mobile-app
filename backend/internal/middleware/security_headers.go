package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets common HTTP security headers on every response.
// These protect against XSS, clickjacking, MIME sniffing, and other common web attacks.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		c.Header("Content-Security-Policy",
			"default-src 'self'; "+
				"connect-src 'self' https://lifegate-backend.onrender.com wss://lifegate-backend.onrender.com; "+
				"img-src 'self' data: https:; "+
				"style-src 'self' 'unsafe-inline'; "+
				"script-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net; "+
				"frame-ancestors 'none'")
		c.Next()
	}
}
