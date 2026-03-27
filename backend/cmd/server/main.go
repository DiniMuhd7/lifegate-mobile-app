package main

import (
"log"

"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/auth"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/db"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/genai"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/middleware"
natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/physician"
redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/review"
wshub "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/websocket"
"github.com/gin-gonic/gin"
)

func main() {
cfg := config.Load()

// Infrastructure
database := db.Connect(cfg.DatabaseURL)
defer database.Close()

redisClient := redisclient.Connect(cfg.RedisURL)
natsClient := natsclient.Connect(cfg.NatsURL)
defer natsClient.Close()

// AI provider
aiProvider := ai.NewProvider(cfg)
log.Printf("AI provider: %s", aiProvider.Name())

// Layers
authRepo := auth.NewRepository(database)
authSvc := auth.NewService(authRepo, redisClient, cfg)
authHandler := auth.NewHandler(authSvc, cfg.UploadDir)

genaiSvc := genai.NewService(aiProvider, database, natsClient)
genaiHandler := genai.NewHandler(genaiSvc)

physicianRepo := physician.NewRepository(database)
physicianSvc := physician.NewService(physicianRepo, natsClient)
physicianHandler := physician.NewHandler(physicianSvc)

reviewSvc := review.NewService(database)
reviewHandler := review.NewHandler(reviewSvc)

hub := wshub.NewHub()

// Router
r := gin.New()
r.Use(middleware.Logger())
r.Use(middleware.CORS())
r.Use(gin.Recovery())

api := r.Group("/api")

// Auth routes
authGroup := api.Group("/auth")
{
authGroup.POST("/login", authHandler.Login)
authGroup.POST("/register", authHandler.Register)
authGroup.POST("/register/start", authHandler.RegisterStart)
authGroup.POST("/register/verify", authHandler.RegisterVerify)
authGroup.POST("/register/resend", authHandler.RegisterResend)
authGroup.POST("/password/send-reset-code", authHandler.SendPasswordResetCode)
authGroup.POST("/password/verify-reset-code", authHandler.VerifyResetCode)
authGroup.POST("/password/reset", authHandler.ResetPassword)
authGroup.GET("/me", middleware.Auth(cfg.JWTSecret), authHandler.Me)
}

// GenAI routes
genaiGroup := api.Group("/genai", middleware.Auth(cfg.JWTSecret))
{
genaiGroup.POST("/chat", genaiHandler.Chat)
}

// Physician routes
physicianGroup := api.Group("/physician", middleware.Auth(cfg.JWTSecret))
{
physicianGroup.GET("/reports", physicianHandler.GetReports)
physicianGroup.GET("/stats", physicianHandler.GetStats)
physicianGroup.POST("/reports/:id/review", physicianHandler.ReviewReport)
}

// Review routes
reviewGroup := api.Group("/review", middleware.Auth(cfg.JWTSecret))
{
reviewGroup.GET("/analysis", reviewHandler.GetAnalysis)
}

// WebSocket
r.GET("/ws", hub.Handler)

addr := ":" + cfg.Port
log.Printf("LifeGate server starting on %s", addr)
if err := r.Run(addr); err != nil {
log.Fatalf("Server failed: %v", err)
}
}
