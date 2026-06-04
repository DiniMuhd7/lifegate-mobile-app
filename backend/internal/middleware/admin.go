package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AdminOnly is a Gin middleware that must be chained after Auth().
// It aborts with 403 if the authenticated user's role is not "admin".
func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "Admin access required",
			})
			return
		}
		c.Next()
	}
}
