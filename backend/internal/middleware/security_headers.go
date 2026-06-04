package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets common HTTP security headers on every response.
//
// STRIDE — Information Disclosure: prevents browsers from caching sensitive
// API responses, blocks MIME sniffing, clickjacking, and XSS-based data leaks.
// STRIDE — Tampering: HSTS and CSP reduce the attack surface for
// man-in-the-middle and script-injection attacks.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevent sensitive API responses from being stored in browser or
		// proxy caches (STRIDE — Information Disclosure).
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
		c.Header("Pragma", "no-cache")

		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		c.Header("Content-Security-Policy",
			"default-src 'self'; "+
				"connect-src 'self' https://edis.dshub.com.ng wss://edis.dshub.com.ng; "+
				"img-src 'self' data: https:; "+
				"style-src 'self' 'unsafe-inline'; "+
				"script-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net; "+
				"frame-ancestors 'none'")
		c.Next()
	}
}
