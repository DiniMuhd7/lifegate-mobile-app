package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// PhysicianOnly is a Gin middleware that must be chained after Auth().
// It aborts with 403 if the authenticated user's role is not "physician" or "admin".
// Admins are granted pass-through so they can inspect physician data for management.
func PhysicianOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		switch role {
		case "physician", "admin":
			c.Next()
		default:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "Physician access required",
			})
		}
	}
}

// PatientOnly is a Gin middleware that must be chained after Auth().
// It aborts with 403 if the authenticated user's role is not "user" (patient).
// Admins are granted pass-through.
func PatientOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		switch role {
		case "user", "admin":
			c.Next()
		default:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "Patient access required",
			})
		}
	}
}
