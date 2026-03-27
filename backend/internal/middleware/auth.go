package middleware

import (
"net/http"
"strings"

"github.com/gin-gonic/gin"
"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
UserID string `json:"user_id"`
Email  string `json:"email"`
Role   string `json:"role"`
jwt.RegisteredClaims
}

func Auth(jwtSecret string) gin.HandlerFunc {
return func(c *gin.Context) {
authHeader := c.GetHeader("Authorization")
if authHeader == "" {
c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Authorization header required"})
return
}

parts := strings.SplitN(authHeader, " ", 2)
if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Invalid authorization format"})
return
}

tokenStr := parts[1]
claims := &Claims{}
token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
return []byte(jwtSecret), nil
}, jwt.WithValidMethods([]string{"HS256"}))

if err != nil || !token.Valid {
c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Invalid or expired token"})
return
}

c.Set("userID", claims.UserID)
c.Set("email", claims.Email)
c.Set("role", claims.Role)
c.Next()
}
}
