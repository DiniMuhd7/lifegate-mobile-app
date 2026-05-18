package middleware

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Context keys set by the APIKey middleware.
const (
	CtxKeyInstitutionalTier = "institutional_tier"
	CtxKeyInstitutionalID   = "institutional_id"
)

// APIKey authenticates institutional callers via the X-API-Key header.
// It performs a single point-lookup against public_access_requests and
// aborts the request if the key is missing, unknown, or the row is not
// in the 'approved' state.
//
// On success it stores the tier ("export" | "api") and request UUID in the
// Gin context so downstream handlers can gate tier-specific features.
func APIKey(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-API-Key")
		if key == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "X-API-Key header is required",
			})
			return
		}

		var id, tier string
		err := db.QueryRowContext(
			c.Request.Context(),
			`SELECT id, tier
			   FROM public_access_requests
			  WHERE api_key       = $1
			    AND access_status = 'approved'`,
			key,
		).Scan(&id, &tier)

		if errors.Is(err, sql.ErrNoRows) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "Invalid or inactive API key",
			})
			return
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "key validation error",
			})
			return
		}

		c.Set(CtxKeyInstitutionalTier, tier)
		c.Set(CtxKeyInstitutionalID, id)
		c.Next()
	}
}

// InstitutionalCORS allows cross-origin requests from any origin while
// advertising the X-API-Key header so browser clients can authenticate.
func InstitutionalCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Accept, Content-Type, X-API-Key")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
