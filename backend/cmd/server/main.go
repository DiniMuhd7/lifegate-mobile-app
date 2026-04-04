// Package main is the entry-point for the LifeGate API server.
//
// @title                      LifeGate API
// @version                    1.0
// @description                AI-powered clinical diagnostic platform. Patients interact with an AI assistant, physicians review AI-generated reports, and administrators manage the full lifecycle.
// @termsOfService             https://lifegate.health/terms
//
// @contact.name               LifeGate Support
// @contact.email              support@lifegate.health
//
// @license.name               Proprietary
//
// @host                       lifegate-backend.onrender.com
// @BasePath                   /api
// @schemes                    https http
//
// @securityDefinitions.apikey BearerAuth
// @in                         header
// @name                       Authorization
// @description                Enter your JWT token as: Bearer <token>
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	docs "github.com/DiniMuhd7/lifegate-mobile-app/backend/docs"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/admin"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/alerts"
	auditpkg "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/audit"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/auth"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/db"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/migrations"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/diagnosis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/genai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/middleware"
	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/notifications"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/payments"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/physician"
	redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/review"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sessions"
	slasvc "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sla"
	wshub "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func main() {
	cfg := config.Load()

	// Configure Swagger UI host dynamically so it works on both localhost
	// and the production Render URL without rebuilding.
	// On Render, the HOST env var is set. Locally it is unset, so we default
	// to localhost:<port> with http so the "Try it out" button hits the right server.
	swaggerHost := cfg.SwaggerHost
	if swaggerHost == "" {
		// No explicit override — running locally.
		docs.SwaggerInfo.Host = "localhost:" + cfg.Port
		docs.SwaggerInfo.Schemes = []string{"http"}
	} else {
		docs.SwaggerInfo.Host = swaggerHost
		docs.SwaggerInfo.Schemes = []string{"https"}
	}

	// Fail fast on a weak JWT secret — minimum 32 bytes for HS256 security.
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("FATAL: JWT_SECRET must be at least 32 characters. Set a strong secret in .env")
	}

	// Infrastructure
database := db.Connect(cfg.DatabaseURL)
defer database.Close()

	// Run any pending migrations automatically on startup.
	if err := db.RunMigrations(database, migrations.FS); err != nil {
		log.Fatalf("FATAL: database migration failed: %v", err)
	}

redisClient := redisclient.Connect(cfg.RedisURL)
natsClient := natsclient.Connect(cfg.NatsURL)
defer natsClient.Close()

// AI provider
aiProvider := ai.NewProvider(cfg)
log.Printf("AI provider: %s", aiProvider.Name())

// Layers
authRepo := auth.NewRepository(database)
authSvc := auth.NewService(authRepo, redisClient, cfg)
authSvc.SetNATSPublisher(natsClient)
authHandler := auth.NewHandler(authSvc, cfg.UploadDir)

sessionsRepo := sessions.NewRepository(database)
	sessionsSvc := sessions.NewService(sessionsRepo, redisClient)
	sessionsHandler := sessions.NewHandler(sessionsSvc)

	edisEngine := edis.NewEngine(aiProvider)
	genaiSvc := genai.NewService(edisEngine, database, natsClient, sessionsSvc)
	genaiHandler := genai.NewHandler(genaiSvc)

hub := wshub.NewHub()

	// NATS → WebSocket bridge: subscribe to durable NATS subjects and push
	// real-time events to the relevant connected clients.
	_ = natsClient.Subscribe("ai.diagnosis.preliminary", func(_ string, data []byte) {
		var p struct {
			UserID string `json:"user_id"`
		}
		if jsonErr := json.Unmarshal(data, &p); jsonErr == nil && p.UserID != "" {
			hub.BroadcastToUser(p.UserID, "diagnosis.update", data)
		}
	})
	_ = natsClient.Subscribe("early_flag.detected", func(_ string, data []byte) {
		hub.BroadcastToRole("professional", "physician.review.status", data)
	})
	_ = natsClient.Subscribe("physician.review.completed", func(_ string, data []byte) {
		hub.BroadcastToRole("professional", "physician.review.status", data)
	})
	_ = natsClient.Subscribe("physician.verification.confirmed", func(_ string, data []byte) {
		hub.BroadcastToRole("admin", "case.state.changed", data)
	})
	_ = natsClient.Subscribe("admin.sla.breach.alert", func(_ string, data []byte) {
		hub.BroadcastToRole("admin", "case.state.changed", data)
	})

	physicianRepo := physician.NewRepository(database)
	physicianSvc := physician.NewService(physicianRepo, natsClient, hub)
	physicianHandler := physician.NewHandler(physicianSvc)

	// Wire the WebSocket hub into the AI service so new escalated cases
	// are broadcast to all connected physicians in real time.
	genaiSvc.SetPhysicianNotifier(hub)

	// Push notification service (Expo Push API + Redis token storage).
	pushSvc := notifications.NewService(redisClient)

	// Wire push notifications so physicians receive patient-case events
	// and patients receive completion notifications from physician reviews.
	physicianSvc.SetPushNotifier(pushSvc)

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

	// Admin system
	adminRepo := admin.NewRepository(database)
	adminSvc := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminSvc)

	// Wire the admin SLA breach recorder into the physician service so that
	// completed cases which exceed the SLA are automatically logged and the
	// 3-breach-per-week flag is evaluated after every completion.
	physicianSvc.SetSLABreachRecorder(adminSvc)

	// SLA enforcement service — runs every 2 minutes in the background,
	// detects Pending/Active cases that exceed the 4-hour SLA window, and
	// auto-reassigns them to the next available physician.
	slaEnforcer := slasvc.NewService(database, natsClient, pushSvc)
	go slaEnforcer.Start(context.Background())

// Router
r := gin.New()
r.Use(middleware.Logger())
r.Use(middleware.CORS())
r.Use(gin.Recovery())
// Attach the audit writer to every request context.
r.Use(func(c *gin.Context) {
	ctx := auditpkg.NewContext(c.Request.Context(), adminSvc)
	c.Request = c.Request.WithContext(ctx)
	c.Next()
})

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
	genaiGroup.POST("/health-check", genaiHandler.HealthCheck)
	genaiGroup.GET("/status", genaiHandler.Status)
}

// Session-scoped AI routes
chatSessionsGroup := api.Group("/chat/sessions", middleware.Auth(cfg.JWTSecret))
{
	chatSessionsGroup.POST("/:id/ai-message", genaiHandler.ChatSession)
	chatSessionsGroup.POST("/:id/finalize", genaiHandler.FinalizeSession)
}

	// Physician routes — require both a valid JWT and the "physician" (or "admin") role.
	physicianGroup := api.Group("/physician", middleware.Auth(cfg.JWTSecret), middleware.PhysicianOnly())
{
physicianGroup.GET("/reports", physicianHandler.GetReports)
physicianGroup.GET("/stats", physicianHandler.GetStats)
physicianGroup.POST("/reports/:id/review", physicianHandler.ReviewReport)
// Case queue (Pending / Active / Completed grouped)
physicianGroup.GET("/cases", physicianHandler.GetCaseQueue)
// Full case detail for the case review screen
physicianGroup.GET("/cases/:id", physicianHandler.GetCaseDetail)
// Atomically take (lock) a Pending case → Active
physicianGroup.POST("/cases/:id/take", physicianHandler.TakeCase)
// Physician inline edit of AI output (condition / urgency / confidence)
physicianGroup.PATCH("/cases/:id/ai", physicianHandler.UpdateAIOutput)
// Patient profile for inline display during case review
physicianGroup.GET("/patients/:id", physicianHandler.GetPatientProfile)
// Earnings dashboard and history
physicianGroup.GET("/earnings", physicianHandler.GetEarningsSummary)
physicianGroup.GET("/earnings/history", physicianHandler.GetEarningsHistory)
physicianGroup.GET("/payouts", physicianHandler.GetPayouts)
// Register/update device push token for in-app notifications
physicianGroup.POST("/push-token", func(c *gin.Context) {
	var req notifications.RegisterTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "token is required"})
		return
	}
	uid, _ := c.Get("userID")
	uidStr, _ := uid.(string)
	if err := pushSvc.RegisterToken(c.Request.Context(), uidStr, req.Token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to store token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Push token registered"})
})
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

	// Patient push-token registration (Expo push token stored per-user for
	// completion notifications).
	api.POST("/push-token", middleware.Auth(cfg.JWTSecret), func(c *gin.Context) {
		var req notifications.RegisterTokenRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "token is required"})
			return
		}
		uid, _ := c.Get("userID")
		uidStr, _ := uid.(string)
		if err := pushSvc.RegisterUserToken(c.Request.Context(), uidStr, req.Token); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to store token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Push token registered"})
	})

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

	// Admin routes — require both a valid JWT and the "admin" role.
	adminGroup := api.Group("/admin", middleware.Auth(cfg.JWTSecret), middleware.AdminOnly())
	{
		adminGroup.GET("/dashboard", adminHandler.GetDashboard)
		adminGroup.GET("/cases", adminHandler.GetCases)
		adminGroup.GET("/sla", adminHandler.GetSLA)
		adminGroup.GET("/sla/breach-alerts", adminHandler.GetSLABreachAlerts)
		adminGroup.GET("/sla/reassignment-log", adminHandler.GetReassignmentLog)
		adminGroup.GET("/metrics/edis", adminHandler.GetEDISMetrics)

		// Physician account management
		adminGroup.GET("/physicians", adminHandler.GetPhysicians)
		adminGroup.POST("/physicians", adminHandler.CreatePhysician)
		adminGroup.POST("/physicians/flag-check", adminHandler.TriggerFlagCheck)
		adminGroup.GET("/physicians/:id", adminHandler.GetPhysicianDetail)
		adminGroup.PATCH("/physicians/:id", adminHandler.UpdatePhysician)
		adminGroup.DELETE("/physicians/:id", adminHandler.DeletePhysician)
		adminGroup.POST("/physicians/:id/suspend", adminHandler.SuspendPhysician)
		adminGroup.POST("/physicians/:id/unsuspend", adminHandler.UnsuspendPhysician)
		adminGroup.POST("/physicians/:id/mdcn-override", adminHandler.OverrideMDCN)

		// Comprehensive audit log
		adminGroup.GET("/audit", adminHandler.GetAuditLog)
		adminGroup.GET("/audit/export", adminHandler.ExportAuditCSV)

		// Payment & credit transaction log (admin view)
		adminGroup.GET("/transactions", adminHandler.GetAllTransactions)
		adminGroup.GET("/transactions/export", adminHandler.ExportTransactionsCSV)

		// NDPA 2023 compliance
		adminGroup.GET("/compliance/ndpa", adminHandler.GetNDPASnapshots)
		adminGroup.POST("/compliance/ndpa/generate", adminHandler.GenerateNDPASnapshot)
		adminGroup.GET("/compliance/ndpa/export", adminHandler.ExportNDPACSV)

		// Alert threshold configuration
		adminGroup.GET("/settings/alerts", adminHandler.GetAlertThresholds)
		adminGroup.PATCH("/settings/alerts/:key", adminHandler.UpdateAlertThreshold)
	}

	// WebSocket (supports optional ?token= for user-aware broadcasting)
	r.GET("/ws", hub.Handler(cfg.JWTSecret))

	// Swagger UI — /swagger and /swagger/ both redirect to /swagger/index.html
	swaggerHandler := ginSwagger.WrapHandler(swaggerFiles.Handler)
	r.GET("/swagger", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/swagger/index.html")
	})
	r.GET("/swagger/*any", func(c *gin.Context) {
		if c.Param("any") == "/" {
			c.Redirect(http.StatusMovedPermanently, "/swagger/index.html")
			return
		}
		swaggerHandler(c)
	})

	// ── Health / readiness probes ─────────────────────────────────────────────
	// GET /health  — liveness probe (Render, Docker, k8s)
	// GET /health/ready — readiness probe (only passes when DB is reachable)
	r.GET("/health", func(c *gin.Context) {
		type check struct {
			Status string `json:"status"`
		}
		out := gin.H{"service": "lifegate-backend", "version": "1.0"}

		// Database (required)
		if err := database.PingContext(c.Request.Context()); err != nil {
			out["database"] = check{"unhealthy"}
			out["status"] = "degraded"
			c.JSON(http.StatusServiceUnavailable, out)
			return
		}
		out["database"] = check{"healthy"}

		// Redis (optional — degraded but not down)
		if redisClient.Ping(c.Request.Context()) {
			out["redis"] = check{"healthy"}
		} else {
			out["redis"] = check{"degraded"}
		}

		// NATS (optional)
		if natsClient.IsConnected() {
			out["nats"] = check{"healthy"}
		} else {
			out["nats"] = check{"degraded"}
		}

		out["status"] = "ok"
		c.JSON(http.StatusOK, out)
	})

	r.GET("/health/ready", func(c *gin.Context) {
		if err := database.PingContext(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "reason": "database unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ready": true})
	})

	addr := ":" + cfg.Port
	log.Printf("LifeGate server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
