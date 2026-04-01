package main

import (
	"log"
	"net/http"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/alerts"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/auth"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/db"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/diagnosis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/genai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/middleware"
	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/payments"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/physician"
	redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/review"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sessions"
	wshub "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/websocket"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	// Fail fast on a weak JWT secret — minimum 32 bytes for HS256 security.
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("FATAL: JWT_SECRET must be at least 32 characters. Set a strong secret in .env")
	}

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

hub := wshub.NewHub()

	physicianRepo := physician.NewRepository(database)
	physicianSvc := physician.NewService(physicianRepo, natsClient, hub)
	physicianHandler := physician.NewHandler(physicianSvc)

	reviewSvc := review.NewService(database)
	reviewHandler := review.NewHandler(reviewSvc)

	diagnosisSvc := diagnosis.NewService(database)
	diagnosisHandler := diagnosis.NewHandler(diagnosisSvc)

	alertsSvc := alerts.NewService(database)
	alertsHandler := alerts.NewHandler(alertsSvc)

	paymentsSvc := payments.NewService(
		database,
		cfg.FlutterwaveSecretKey,
		cfg.FlutterwavePublicKey,
		cfg.FlutterwaveRedirectURL,
	)
	paymentsHandler := payments.NewHandler(paymentsSvc)

	// Grant trial credits to every new patient that registers.
	authSvc.SetTrialCreditGranter(paymentsSvc)

	sessionsRepo := sessions.NewRepository(database)
	sessionsSvc := sessions.NewService(sessionsRepo, redisClient)
	sessionsHandler := sessions.NewHandler(sessionsSvc)

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
authGroup.POST("/login/verify-2fa", authHandler.VerifyPhysician2FA)
authGroup.POST("/login/resend-2fa", authHandler.ResendPhysician2FA)
authGroup.POST("/register", authHandler.Register)
authGroup.POST("/register/start", authHandler.RegisterStart)
authGroup.POST("/register/verify", authHandler.RegisterVerify)
authGroup.POST("/register/resend", authHandler.RegisterResend)
authGroup.POST("/password/send-reset-code", authHandler.SendPasswordResetCode)
authGroup.POST("/password/verify-reset-code", authHandler.VerifyResetCode)
authGroup.POST("/password/reset", authHandler.ResetPassword)
authGroup.GET("/me", middleware.Auth(cfg.JWTSecret), authHandler.Me)
authGroup.PUT("/change-password", middleware.Auth(cfg.JWTSecret), authHandler.ChangePassword)
authGroup.PATCH("/mdcn-verify", middleware.Auth(cfg.JWTSecret), authHandler.MarkMDCNVerified)
}

// GenAI routes
genaiGroup := api.Group("/genai", middleware.Auth(cfg.JWTSecret))
{
	// For clinical_diagnosis category, deduct 1 credit before calling the AI.
	// We peek at the category query param to avoid consuming the JSON body.
	// The mobile client sends ?category=clinical_diagnosis as a query param
	// in addition to the body so we can gate without body re-reading.
	genaiGroup.POST("/chat", func(c *gin.Context) {
		if c.Query("category") == "clinical_diagnosis" {
			uid, _ := c.Get("userID")
			uidStr, _ := uid.(string)
			ok, err := paymentsSvc.DeductCredit(uidStr, "")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Credit check failed"})
				c.Abort()
				return
			}
			if !ok {
				c.JSON(http.StatusPaymentRequired, gin.H{
					"success": false,
					"code":    "INSUFFICIENT_CREDITS",
					"message": "You have no diagnosis credits remaining. Please top up to continue.",
				})
				c.Abort()
				return
			}
		}
		genaiHandler.Chat(c)
	})
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
		reviewGroup.GET("/diagnoses", reviewHandler.GetDiagnoses)
		reviewGroup.GET("/diagnoses/:id", reviewHandler.GetDiagnosisDetail)
	}

	// Patient diagnosis routes (patient reads their own diagnoses)
	diagnosisGroup := api.Group("/diagnoses", middleware.Auth(cfg.JWTSecret))
	{
		diagnosisGroup.GET("", diagnosisHandler.GetDiagnoses)
		diagnosisGroup.GET("/:id", diagnosisHandler.GetDiagnosisDetail)
	}

	// Patient preventive alerts
	api.GET("/alerts", middleware.Auth(cfg.JWTSecret), alertsHandler.GetPatientAlerts)

	// Physician workload alerts (added to existing physician group above)
	api.GET("/physician/alerts", middleware.Auth(cfg.JWTSecret), alertsHandler.GetPhysicianAlerts)

	// Payments & Credits
	api.GET("/payments/bundles", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetBundles)
	api.POST("/payments/initiate", middleware.Auth(cfg.JWTSecret), paymentsHandler.InitiatePayment)
	api.POST("/payments/verify", middleware.Auth(cfg.JWTSecret), paymentsHandler.VerifyPayment)
	api.GET("/payments/transactions", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetTransactions)
	api.GET("/credits/balance", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetCreditBalance)

	// Chat session management (create, list, get, update, delete + resume prompt)
	sessionsGroup := api.Group("/sessions", middleware.Auth(cfg.JWTSecret))
	{
		sessionsGroup.POST("", sessionsHandler.Create)
		sessionsGroup.GET("", sessionsHandler.List)
		// /incomplete must be registered before /:id so the router does not
		// treat the literal string "incomplete" as a session ID.
		sessionsGroup.GET("/incomplete", sessionsHandler.GetIncomplete)
		sessionsGroup.GET("/:id", sessionsHandler.Get)
		sessionsGroup.PUT("/:id", sessionsHandler.Update)
		sessionsGroup.DELETE("/:id", sessionsHandler.Delete)
	}

	// WebSocket (supports optional ?token= for user-aware broadcasting)
	r.GET("/ws", hub.Handler(cfg.JWTSecret))

	addr := ":" + cfg.Port
	log.Printf("LifeGate server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
