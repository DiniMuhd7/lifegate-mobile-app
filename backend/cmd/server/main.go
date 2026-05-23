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
// @host                       edis.dshub.com.ng
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
	"os"
	"time"

	docs "github.com/DiniMuhd7/lifegate-mobile-app/backend/docs"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/admin"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/alerts"
	auditpkg "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/audit"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/auth"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/db"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/diagnosis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/downloadstats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/explore"
	followupsvc "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/followup"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/genai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/healthmetrics"
	callssvc "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/calls"
	imsvc "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/im"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/middleware"
	natsclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/nats"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/notifications"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/payments"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/physician"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/openclaw"
	redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/referral"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/review"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sensortests"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sessions"
	slasvc "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/sla"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/support"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/surveillance"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/healthaccess"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/resourcegaps"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/pubinsights"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/demography"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/accessportal"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/disparities"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/institutional"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/research"
	wshub "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/websocket"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/migrations"
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

	// Ensure the default admin account always exists (idempotent upsert).
	// The env vars ADMIN_EMAIL / ADMIN_PASSWORD_HASH let ops teams rotate
	// credentials without a code change; they fall back to the seeded defaults.
	adminEmail := getEnvOrDefault("ADMIN_EMAIL", "lifegatebydshub@gmail.com")
	adminHash := getEnvOrDefault("ADMIN_PASSWORD_HASH",
		"$2a$10$0os19tchgoLR8/S4pXEn9up4O1As3KvfkENGd/6RXPQm7pJ7jTEDe")
	if _, err := database.Exec(
		`INSERT INTO users (name, email, password_hash, role)
		 VALUES ('LifeGate Admin', $1, $2, 'admin')
		 ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin'`,
		adminEmail, adminHash,
	); err != nil {
		log.Printf("[startup] warn: could not ensure admin user: %v", err)
	} else {
		log.Printf("[startup] admin account ready: %s", adminEmail)
	}

	redisClient := redisclient.Connect(cfg.RedisURL)
	natsClient := natsclient.Connect(cfg.NatsURL)
	defer natsClient.Close()

	// Clear any accumulated login rate-limit counters for the admin account so
	// a server redeploy always gives the admin a clean slate.
	_ = redisClient.Del(context.Background(), "login:attempts:"+adminEmail)
	log.Printf("[startup] cleared login rate-limit for %s", adminEmail)

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

	sensorSvc := sensortests.NewService(edisEngine)
	sensorHandler := sensortests.NewHandler(sensorSvc, authRepo)

	healthMetricsSvc := healthmetrics.NewService(database)
	healthMetricsHandler := healthmetrics.NewHandler(healthMetricsSvc)
	downloadStatsSvc := downloadstats.NewService(database)
	downloadStatsHandler := downloadstats.NewHandler(downloadStatsSvc)

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
	// early_flag.detected → alert the originating patient only (not a physician queue event).
	_ = natsClient.Subscribe("early_flag.detected", func(_ string, data []byte) {
		var p struct {
			UserID string `json:"user_id"`
		}
		if jsonErr := json.Unmarshal(data, &p); jsonErr == nil && p.UserID != "" {
			hub.BroadcastToUser(p.UserID, "diagnosis.update", data)
		}
	})
	// physician.review.completed — transform field names so the frontend
	// physician.review.status handler (expecting caseId + status) works correctly.
	// Note: broadcastQueueChange in physician/service.go also fires directly via
	// the WS hub for connected clients; this NATS path ensures offline-then-reconnect
	// physicians also receive the queue refresh signal.
	_ = natsClient.Subscribe("physician.review.completed", func(_ string, data []byte) {
		var p struct {
			ReportID string `json:"report_id"`
			Action   string `json:"action"`
		}
		if jsonErr := json.Unmarshal(data, &p); jsonErr != nil || p.ReportID == "" {
			return
		}
		transformed, _ := json.Marshal(map[string]string{
			"caseId": p.ReportID,
			"status": p.Action,
		})
		hub.BroadcastToRole("professional", "physician.review.status", transformed)
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

	// Web Push service (RFC 8292 / browser push notifications).
	webPushSvc := notifications.NewWebPushService(database, cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey, cfg.VAPIDSubject)
	// Mirror every Expo push to browser subscribers as well.
	pushSvc.SetWebPush(webPushSvc)

	// Wire push notifications so physicians receive patient-case events
	// and patients receive completion notifications from physician reviews.
	physicianSvc.SetPushNotifier(pushSvc)

	// Auto-assignment worker — assigns new pending cases to verified physicians,
	// sends patient IM updates, and reassigns cases not completed within 30 minutes.
	go physicianSvc.StartAutoAssignment(context.Background())

	// OpenClaw AI physician worker — generates and posts AI responses for the 24
	// OpenClaw physician agents, then auto-completes cases once EDIS has produced
	// a diagnosis and the AI physician has replied.
	openclawRepo := openclaw.NewRepository(database)
	openclawWorker := openclaw.New(openclawRepo, aiProvider, hub, cfg.OpenClawAgentsDir)
	openclawWorker.SetPushNotifier(pushSvc)
	go openclawWorker.Start(context.Background())

	// Wire physician push broadcasts into the AI service so escalated cases
	// trigger Expo push notifications even when physicians are in the background.
	genaiSvc.SetPhysicianPushBroadcaster(pushSvc)
	genaiSvc.SetOpenAIKey(cfg.OpenAIAPIKey, cfg.OpenAIModel)
	genaiSvc.SetGeminiKey(cfg.GeminiAPIKey, cfg.GeminiModel)

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
		cfg.FlutterwaveWebhookHash,
		cfg.FXRateURL,
		cfg.FXFallbackNGNPerUSD,
		cfg.FXCacheTTL,
	)
	paymentsHandler := payments.NewHandler(paymentsSvc)
	paymentsHandler.SetPushNotifier(pushSvc)
	paymentsHandler.SetHub(hub)
	referralSvc := referral.NewService(database)
	referralSvc.SetCreditGranter(paymentsSvc)
	referralHandler := referral.NewHandler(referralSvc)

	exploreRepo := explore.NewRepository(database)
	exploreSvc := explore.NewService(exploreRepo)
	exploreHandler := explore.NewHandler(exploreSvc)

	// Daily YouTube catalogue refresh — searches each health category every
	// 24 hours and upserts fresh videos into the explore_videos table.
	// videosPerCat=10 fetches 10 candidates per duration band (medium + long)
	// per category so we always land ≥10 videos in the 5–30 min range.
	exploreRefresher := explore.NewRefresher(exploreRepo, cfg.YouTubeAPIKey, 10)
	exploreSvc.SetRefresher(exploreRefresher)
	exploreSvc.SetLifecoinsAdder(paymentsSvc)
	go exploreRefresher.Start(context.Background())

	// Grant trial credits to every new patient that registers.
	authSvc.SetTrialCreditGranter(paymentsSvc)
	authSvc.SetReferralProcessor(referralSvc)

	// Hourly job: deactivate Premium subscriptions that have passed their
	// expiry date so that DeductCredit correctly bills them again.
	go func() {
		for {
			time.Sleep(1 * time.Hour)
			if n, err := paymentsSvc.DeactivateExpiredPremium(); err != nil {
				log.Printf("[premium-job] error deactivating expired subscriptions: %v", err)
			} else if n > 0 {
				log.Printf("[premium-job] deactivated %d expired Premium subscription(s)", n)
			}
		}
	}()

	// Daily job: permanently delete user accounts whose 90-day deletion window has elapsed.
	go func() {
		for {
			if n, err := authSvc.DeleteExpiredAccounts(); err != nil {
				log.Printf("[deletion-job] error purging expired accounts: %v", err)
			} else if n > 0 {
				log.Printf("[deletion-job] permanently deleted %d expired account(s)", n)
			}
			// Sleep until midnight UTC to run once per day.
			now := time.Now().UTC()
			next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
			time.Sleep(time.Until(next))
		}
	}()

	supportSvc := support.NewService(cfg)
	supportHandler := support.NewHandler(supportSvc)

	// Admin system
	adminRepo := admin.NewRepository(database)
	adminSvc := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminSvc, diagnosisSvc)

	// Wire the admin SLA breach recorder into the physician service so that
	// completed cases which exceed the SLA are automatically logged and the
	// 3-breach-per-week flag is evaluated after every completion.
	physicianSvc.SetSLABreachRecorder(adminSvc)

	// Disease Surveillance & Early Warning (Public Health Analytics Dashboard)
	surveillanceRepo := surveillance.NewRepository(database)
	surveillanceSvc := surveillance.NewService(surveillanceRepo, natsClient)
	surveillanceHandler := surveillance.NewHandler(surveillanceSvc)
	go surveillanceSvc.Start(context.Background())

	// Healthcare Access & SLA metrics (Public Health Analytics Dashboard)
	healthAccessRepo := healthaccess.NewRepository(database)
	healthAccessHandler := healthaccess.NewHandler(healthAccessRepo)

	// Resource Gap Analysis — condition burden vs specialist coverage
	resourceGapsRepo := resourcegaps.NewRepository(database)
	resourceGapsHandler := resourcegaps.NewHandler(resourceGapsRepo)

	// Public Insights — telemedicine utilization & compliance/NDPA summary
	pubInsightsRepo := pubinsights.NewRepository(database)
	pubInsightsHandler := pubinsights.NewHandler(pubInsightsRepo)

	// Demography — demographic burden & follow-up re-engagement
	demographyRepo := demography.NewRepository(database)
	demographyHandler := demography.NewHandler(demographyRepo)

// Access Portal — institutional access requests with Flutterwave payment
        accessPortalRepo := accessportal.NewRepository(database, cfg.FlutterwaveSecretKey, cfg.FlutterwaveWebhookHash, cfg.ResendAPIKey, cfg.EmailFrom, cfg.SupportEmail)
        accessPortalHandler := accessportal.NewHandler(accessPortalRepo, cfg.FlutterwavePublicKey)

        // Disparities — symptom burden + SES proxies, physician response-time inequality
	disparitiesRepo := disparities.NewRepository(database)
	disparitiesHandler := disparities.NewHandler(disparitiesRepo)

	// Research — longitudinal records, AI benchmark, comorbidity
	researchRepo := research.NewRepository(database)
	researchHandler := research.NewHandler(researchRepo)

	// SLA enforcement service — runs every 2 minutes in the background,
	// detects Pending/Active cases that exceed the 4-hour SLA window, and
	// auto-reassigns them to the next available physician.
	slaEnforcer := slasvc.NewService(database, natsClient, pushSvc)
	go slaEnforcer.Start(context.Background())

	// Follow-up worker — scans every 5 minutes for cases whose follow_up_date
	// has arrived, notifies the patient to check in, and auto-escalates
	// non-responders to the physician queue after a 24-hour grace period.
	followUpWorker := followupsvc.NewService(database, natsClient, pushSvc)
	go followUpWorker.Start(context.Background())

	// Router
	r := gin.New()
	r.Use(middleware.RequestID())      // STRIDE Repudiation: attach unique ID to every request
	r.Use(middleware.Logger())         // STRIDE Repudiation: log IP + user ID + request ID
	r.Use(middleware.CORS())
	r.Use(middleware.SecurityHeaders()) // STRIDE InfoDisclosure/Tampering: security + cache headers
	r.Use(middleware.RateLimit(200, 60)) // STRIDE DoS: 200 req/min per IP across all endpoints
	r.Use(gin.Recovery())
	// Reject requests whose body exceeds 4 MB to prevent resource exhaustion.
	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)
		c.Next()
	})
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
		authGroup.POST("/google", authHandler.GoogleLogin)
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/register/start", authHandler.RegisterStart)
		authGroup.POST("/register/verify", authHandler.RegisterVerify)
		authGroup.POST("/register/resend", authHandler.RegisterResend)
		authGroup.POST("/password/send-reset-code", authHandler.SendPasswordResetCode)
		authGroup.POST("/password/verify-reset-code", authHandler.VerifyResetCode)
		authGroup.POST("/password/reset", authHandler.ResetPassword)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/logout", authHandler.Logout)
		authGroup.GET("/me", middleware.Auth(cfg.JWTSecret), authHandler.Me)
		authGroup.PUT("/change-password", middleware.Auth(cfg.JWTSecret), authHandler.ChangePassword)
		authGroup.PUT("/health-profile", middleware.Auth(cfg.JWTSecret), authHandler.UpdateHealthProfile)
		authGroup.PATCH("/profile", middleware.Auth(cfg.JWTSecret), authHandler.UpdateBasicProfile)
		authGroup.PATCH("/mdcn-verify", middleware.Auth(cfg.JWTSecret), authHandler.MarkMDCNVerified)
		authGroup.POST("/account/delete", middleware.Auth(cfg.JWTSecret), authHandler.RequestAccountDeletion)
		authGroup.DELETE("/account/delete", middleware.Auth(cfg.JWTSecret), authHandler.CancelAccountDeletion)
	}

	supportGroup := api.Group("/support", middleware.Auth(cfg.JWTSecret))
	{
		supportGroup.POST("/contact", supportHandler.ContactSupport)
	}

	// GenAI routes
	genaiGroup := api.Group("/genai", middleware.Auth(cfg.JWTSecret))
	{
		// For clinical_diagnosis category, deduct 1 credit before calling the AI.
		// We peek at the category query param to avoid consuming the JSON body.
		// The mobile client sends ?category=clinical_diagnosis as a query param
		// in addition to the body so we can gate without body re-reading.
		genaiGroup.POST("/chat", func(c *gin.Context) {
			var refundUID string
			if c.Query("category") == "clinical_diagnosis" {
				uid, _ := c.Get("userID")
				uidStr, _ := uid.(string)

				// Skip credit deduction when the patient is continuing an existing
				// active or pending case — only new sessions must consume a credit.
				diagnosisID := c.Query("diagnosisId")
				if diagnosisID != "" {
					var count int
					if qErr := database.QueryRowContext(c.Request.Context(),
						`SELECT COUNT(1) FROM diagnoses
						 WHERE id = $1::uuid AND user_id = $2::uuid
						   AND status IN ('Pending', 'Active')`,
						diagnosisID, uidStr).Scan(&count); qErr == nil && count > 0 {
						genaiHandler.Chat(c)
						return
					}
				}

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
				refundUID = uidStr
			}
			genaiHandler.Chat(c)
			// Refund the credit if:
			//  a) the AI handler returned a server error — user should not be
			//     billed for a failed request, OR
			//  b) the AI matched an existing active case via duplicate detection
			//     (is_existing_case=true) — updating a case consumes no credit.
			if refundUID != "" {
				isExisting, _ := c.Get("is_existing_case")
				isExistingBool, _ := isExisting.(bool)
				if c.Writer.Status() >= 500 || isExistingBool {
					if isExistingBool {
						log.Printf("[CREDIT] refunding credit — existing case updated (user=%s)", refundUID)
					}
					_ = paymentsSvc.RefundCredit(refundUID)
				}
			}
		})
		genaiGroup.POST("/health-check", genaiHandler.HealthCheck)
		genaiGroup.GET("/status", genaiHandler.Status)
		genaiGroup.POST("/transcribe", genaiHandler.Transcribe)
		genaiGroup.POST("/scan", genaiHandler.ScanImage)
	}

	// Session-scoped AI routes
	chatSessionsGroup := api.Group("/chat/sessions", middleware.Auth(cfg.JWTSecret))
	{
		chatSessionsGroup.POST("/:id/ai-message", genaiHandler.ChatSession)
		chatSessionsGroup.POST("/:id/finalize", genaiHandler.FinalizeSession)
	}

	// Patient-accessible physician preview endpoint — authenticated patients can browse
	// verified physicians before requesting a consultation (clinical mode only in the UI).
	api.GET("/physicians/available", middleware.Auth(cfg.JWTSecret), genaiHandler.GetAvailablePhysicians)

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
		// Patient check-in history for physician review
		physicianGroup.GET("/patients/:id/checkins", physicianHandler.GetPatientCheckins)
		// Earnings dashboard and history
		physicianGroup.GET("/earnings", physicianHandler.GetEarningsSummary)
		physicianGroup.GET("/earnings/history", physicianHandler.GetEarningsHistory)
		physicianGroup.GET("/payouts", physicianHandler.GetPayouts)
		physicianGroup.POST("/payouts/request", physicianHandler.RequestPayout)
		physicianGroup.PATCH("/profile", physicianHandler.UpdateProfile)
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

	// Review routes — restricted to physicians and admins only.
	reviewGroup := api.Group("/review", middleware.Auth(cfg.JWTSecret), middleware.PhysicianOnly())
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
		diagnosisGroup.POST("/:id/outcome", diagnosisHandler.SubmitOutcome)
		diagnosisGroup.POST("/:id/request-medication-release", diagnosisHandler.RequestMedicationRelease)
	}

	// Patient preventive alerts
	api.GET("/alerts", middleware.Auth(cfg.JWTSecret), alertsHandler.GetPatientAlerts)

	// Physician workload alerts (added to existing physician group above)
	api.GET("/physician/alerts", middleware.Auth(cfg.JWTSecret), alertsHandler.GetPhysicianAlerts)

	// Payments & Credits
	// Webhook is public (no JWT) — Flutterwave calls it directly.
	// Authenticity is verified inside the handler via the verif-hash header.
	api.POST("/payments/webhook", paymentsHandler.Webhook)
	api.GET("/payments/bundles", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetBundles)
	api.POST("/payments/initiate", middleware.Auth(cfg.JWTSecret), paymentsHandler.InitiatePayment)
	api.GET("/payments/tx-status", middleware.Auth(cfg.JWTSecret), paymentsHandler.TxStatus)
	api.POST("/payments/verify", middleware.Auth(cfg.JWTSecret), paymentsHandler.VerifyPayment)
	api.GET("/payments/transactions", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetTransactions)
	api.GET("/credits/balance", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetCreditBalance)
	api.GET("/credits/deductions", middleware.Auth(cfg.JWTSecret), paymentsHandler.GetCreditDeductions)
	api.GET("/referral/stats", middleware.Auth(cfg.JWTSecret), referralHandler.GetStats)

	// Lifecoins wallet — health-engagement rewards and health-insurance waiver redemption.
	lifecoinsGroup := api.Group("/lifecoins", middleware.Auth(cfg.JWTSecret))
	{
		lifecoinsGroup.GET("/balance", paymentsHandler.GetLifecoinBalance)
		lifecoinsGroup.GET("/transactions", paymentsHandler.GetLifecoinTransactions)
		lifecoinsGroup.POST("/redeem", paymentsHandler.RedeemLifecoins)
		lifecoinsGroup.POST("/checkin", paymentsHandler.ClaimCheckinSlot)
	}
	api.POST("/checkins/answers", middleware.Auth(cfg.JWTSecret), paymentsHandler.SubmitCheckinAnswers)

	// Explore — health education videos
	exploreGroup := api.Group("/explore", middleware.Auth(cfg.JWTSecret))
	{
		exploreGroup.GET("/videos", exploreHandler.ListVideos)
		exploreGroup.POST("/claim", exploreHandler.ClaimReward)
	}

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

		// Send a push reminder if the patient's health profile is incomplete.
		go func() {
			user, err := authRepo.FindUserByID(uidStr)
			if err != nil || user == nil {
				return
			}
			incomplete := user.BloodType == nil || user.Genotype == nil ||
				user.Allergies == nil || user.MedicalHistory == nil ||
				user.CurrentMedications == nil || user.EmergencyContact == nil
			if incomplete {
				pushSvc.SendToUser(
					context.Background(),
					uidStr,
					"Complete Your Health Profile",
					"A complete profile helps our AI give you safer, more personalised care. Tap to fill in the missing details.",
					map[string]string{"action": "complete_profile"},
				)
			}
		}()

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Push token registered"})
	})

	// ── Web Push (RFC 8292) ───────────────────────────────────────────────────
	// Expose VAPID public key so the browser can call PushManager.subscribe().
	api.GET("/vapid-public-key", func(c *gin.Context) {
		if webPushSvc == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "web push not configured"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "vapidPublicKey": webPushSvc.VAPIDPublicKey()})
	})

	// Save or update a browser PushSubscription for the authenticated user.
	api.POST("/web-push/subscribe", middleware.Auth(cfg.JWTSecret), func(c *gin.Context) {
		if webPushSvc == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "web push not configured"})
			return
		}
		var sub notifications.WebPushSubscription
		if err := c.ShouldBindJSON(&sub); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}
		uid, _ := c.Get("userID")
		if err := webPushSvc.SaveSubscription(c.Request.Context(), uid.(string), sub); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to save subscription"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Subscribed"})
	})

	// Remove a browser PushSubscription (called when the user unsubscribes).
	api.DELETE("/web-push/subscribe", middleware.Auth(cfg.JWTSecret), func(c *gin.Context) {
		if webPushSvc == nil {
			c.JSON(http.StatusNoContent, nil)
			return
		}
		var body struct {
			Endpoint string `json:"endpoint" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}
		_ = webPushSvc.DeleteSubscription(c.Request.Context(), body.Endpoint)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Unsubscribed"})
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
		adminGroup.POST("/credits/adjust", adminHandler.AdjustCredit)

		// NDPA 2023 compliance
		adminGroup.GET("/compliance/ndpa", adminHandler.GetNDPASnapshots)
		adminGroup.POST("/compliance/ndpa/generate", adminHandler.GenerateNDPASnapshot)
		adminGroup.GET("/compliance/ndpa/export", adminHandler.ExportNDPACSV)

		// Alert threshold configuration
		adminGroup.GET("/settings/alerts", adminHandler.GetAlertThresholds)
		adminGroup.PATCH("/settings/alerts/:key", adminHandler.UpdateAlertThreshold)

		// Lifecoins redemption approval queue
		adminGroup.GET("/lifecoins/redemptions", paymentsHandler.GetPendingRedemptions)
		adminGroup.POST("/lifecoins/redemptions/:id/approve", paymentsHandler.ApproveRedemption)
		adminGroup.POST("/lifecoins/redemptions/:id/reject", paymentsHandler.RejectRedemption)

		// Explore catalogue management
		adminGroup.POST("/explore/refresh", exploreHandler.TriggerRefresh)

		// Physician payout request approval queue
		adminGroup.GET("/physician-payouts", physicianHandler.AdminListPayoutRequests)
		adminGroup.POST("/physician-payouts/:id/approve", physicianHandler.AdminApprovePayoutRequest)
		adminGroup.POST("/physician-payouts/:id/reject", physicianHandler.AdminRejectPayoutRequest)

		// Medication release approval queue
		adminGroup.GET("/medication-releases", adminHandler.GetMedicationReleases)
		adminGroup.POST("/medication-releases/approve-all", adminHandler.ApproveAllMedicationReleases)
		adminGroup.POST("/medication-releases/:id/approve", adminHandler.ApproveMedicationRelease)
		adminGroup.GET("/access-requests", accessPortalHandler.ListAccessRequests)
		adminGroup.PATCH("/access-requests/:id/review", accessPortalHandler.ReviewAccessRequest)
	}

	// Sensor-test interpretation (EDIS-backed vision + hearing)
	sensorGroup := api.Group("/sensor-tests", middleware.Auth(cfg.JWTSecret))
	{
		sensorGroup.POST("/vision/interpret", sensorHandler.InterpretVision)
		sensorGroup.POST("/hearing/interpret", sensorHandler.InterpretHearing)
	}

	// Continuous background health monitoring — step count, active minutes,
	// distance, and calorie snapshots uploaded periodically by the mobile client.
	healthMetricsGroup := api.Group("/health-metrics", middleware.Auth(cfg.JWTSecret))
	{
		healthMetricsGroup.POST("/sync", healthMetricsHandler.Sync)
		healthMetricsGroup.GET("/today", healthMetricsHandler.Today)
	}

	// ── Public Health Analytics Dashboard (no auth, open CORS, low rate limit) ──
	// These endpoints serve the public.dshub.com.ng dashboard.  All responses
	// contain only anonymised, state-level aggregate data (k-anon ≥ 3).
	publicGroup := api.Group("/public",
		surveillance.PublicCORS(),
		middleware.RateLimit(30, 60), // 30 req/min per IP
	)
	{
		survGroup := publicGroup.Group("/surveillance")
		survGroup.GET("/summary", surveillanceHandler.GetSummary)
		survGroup.GET("/trends", surveillanceHandler.GetTrends)
		survGroup.GET("/by-state", surveillanceHandler.GetByState)
		survGroup.GET("/anomalies", surveillanceHandler.GetAnomalies)
		survGroup.GET("/seasonal", surveillanceHandler.GetSeasonal)

		accessGroup := publicGroup.Group("/health-access")
		accessGroup.GET("/summary", healthAccessHandler.GetSummary)
		accessGroup.GET("/by-state", healthAccessHandler.GetByState)

		gapGroup := publicGroup.Group("/resource-gaps")
		gapGroup.GET("", resourceGapsHandler.GetGaps)

		insightsGroup := publicGroup.Group("/insights")
		insightsGroup.GET("/telemedicine", pubInsightsHandler.GetTelemedicine)
		insightsGroup.GET("/compliance", pubInsightsHandler.GetCompliance)

		demoGroup := publicGroup.Group("/demographics")
		demoGroup.GET("/burden", demographyHandler.GetBurden)
		demoGroup.GET("/followup", demographyHandler.GetFollowUp)

		researchGroup := publicGroup.Group("/research")
		researchGroup.GET("/longitudinal", researchHandler.GetLongitudinal)
		researchGroup.GET("/ai-benchmark", researchHandler.GetAIBenchmark)
		researchGroup.GET("/comorbidity", researchHandler.GetComorbidity)
		researchGroup.GET("/agreement", researchHandler.GetAgreementPatterns)
		researchGroup.GET("/escalation", researchHandler.GetEscalationAnalysis)

		dispGroup := publicGroup.Group("/disparities")
		dispGroup.GET("/symptom-burden", disparitiesHandler.GetSymptomBurden)
		dispGroup.GET("/response-times", disparitiesHandler.GetResponseTimeInequality)

                apGroup := publicGroup.Group("/access")
                apGroup.GET("/config", accessPortalHandler.GetConfig)
                apGroup.POST("/submit", accessPortalHandler.Submit)
                apGroup.POST("/webhook", accessPortalHandler.Webhook)
				apGroup.POST("/status", accessPortalHandler.CheckStatus)
	}

	// ── Institutional Analytics API (API-key auth, 200 req/min) ────────────────
	// Deep analytics for approved institutional callers (researchers, NGOs, MoH).
	// All queries enforce k-anonymity (≥ 3 cases) and return aggregates only.
	instRepo := institutional.NewRepository(database)
	instHandler := institutional.NewHandler(instRepo)
	instGroup := api.Group("/institutional",
		middleware.InstitutionalCORS(),
		middleware.APIKey(database),
		middleware.RateLimit(200, 60),
	)
	{
		instGroup.GET("/surveillance/trends", instHandler.GetSurveillanceTrends)
		instGroup.GET("/demographics", instHandler.GetDemographics)
		instGroup.GET("/outcomes", instHandler.GetOutcomes)
		instGroup.GET("/disparities", instHandler.GetDisparities)
		instGroup.GET("/export", instHandler.Export)
	}

	downloadStatsGroup := api.Group("/download-stats")
	{
		downloadStatsGroup.GET("", downloadStatsHandler.Get)
		downloadStatsGroup.POST("/events", downloadStatsHandler.Track)
	}

	// Instant messaging — patient ↔ physician on a per-diagnosis basis.
	// Both "user" and "professional" roles may access these routes; the
	// middleware.Auth guard ensures only authenticated callers reach them.
	imService := imsvc.NewService(database)
	imHandler := imsvc.NewHandler(imService, database, hub, pushSvc)

	imGroup := api.Group("/im", middleware.Auth(cfg.JWTSecret))
	{
		// GET  /im/:diagnosisId        — fetch full conversation history
		imGroup.GET("/:diagnosisId", imHandler.ListMessages)
		// POST /im/:diagnosisId        — send a new message
		imGroup.POST("/:diagnosisId", imHandler.SendMessage)
		// PUT  /im/:diagnosisId/read   — mark all incoming messages as read
		imGroup.PUT("/:diagnosisId/read", imHandler.MarkRead)
		// GET  /im/:diagnosisId/unread — unread count for the calling role
		imGroup.GET("/:diagnosisId/unread", imHandler.UnreadCount)
		// POST /im/:diagnosisId/typing — broadcast typing indicator
		imGroup.POST("/:diagnosisId/typing", imHandler.SendTypingIndicator)
	}

	// ── Voice & Video Calls ────────────────────────────────────────────────────
	// aiProvider is the same instance used by EDIS and OpenClaw IM, so the model
	// name is guaranteed to stay in sync across all AI subsystems.
	// cfg.OpenAIAPIKey is passed separately as the raw key for Whisper STT and TTS
	// (OpenAI audio endpoints used regardless of which chat provider is active).
	callsHandler := callssvc.NewHandler(hub, pushSvc, database, cfg.OpenClawAgentsDir, aiProvider, cfg.OpenAIAPIKey)
	callsGroup := api.Group("/calls", middleware.Auth(cfg.JWTSecret))
	{
		// POST /calls/offer           — caller initiates, relays SDP offer to callee
		callsGroup.POST("/offer", callsHandler.Offer)
		// POST /calls/answer          — callee accepts, relays SDP answer to caller
		callsGroup.POST("/answer", callsHandler.Answer)
		// POST /calls/:callId/reject  — callee declines incoming call
		callsGroup.POST("/:callId/reject", callsHandler.Reject)
		// POST /calls/:callId/end     — either party ends the call
		callsGroup.POST("/:callId/end", callsHandler.End)
		// POST /calls/:callId/ice     — relay WebRTC ICE candidate to peer
		callsGroup.POST("/:callId/ice", callsHandler.IceCandidate)
	}

	// WebSocket (supports optional ?token= for user-aware broadcasting)
	r.GET("/ws", hub.Handler(cfg.JWTSecret))

	// Swagger UI — disabled in production (GIN_MODE=release) to avoid exposing
	// the full API schema to unauthenticated users.
	if gin.Mode() != gin.ReleaseMode {
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
	}

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

	// /payment-callback — Flutterwave redirects here after checkout on web.
	// Serves a small HTML page that tells the user to return to the app and
	// confirms or reports the payment status. No authentication required.
	r.GET("/payment-callback", func(c *gin.Context) {
		status := c.Query("status") // "successful" | "cancelled" | "failed"
		txRef := c.Query("tx_ref")
		flwTxID := c.Query("transaction_id")
		verificationPending := false

		if status == "successful" && txRef != "" {
			pt, err := paymentsSvc.VerifyAndCreditByTxRef(txRef, flwTxID)
			if err != nil {
				log.Printf("payment callback verification failed tx_ref=%s transaction_id=%s: %v", txRef, flwTxID, err)
				verificationPending = true
			} else if pt == nil || pt.Status != "success" {
				verificationPending = true
			}
		}

		var heading, body, iconColor, iconSVG string
		switch status {
		case "cancelled":
			heading = "Payment Cancelled"
			body = "You cancelled the payment. No charges were made.<br>You can close this tab and try again."
			iconColor = "#f59e0b"
			iconSVG = `<circle cx="50" cy="50" r="45" fill="#fef3c7"/><line x1="33" y1="33" x2="67" y2="67" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><line x1="67" y1="33" x2="33" y2="67" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/>`
		case "failed":
			heading = "Payment Failed"
			body = "The payment could not be processed. No charges were made.<br>You can close this tab and try again."
			iconColor = "#ef4444"
			iconSVG = `<circle cx="50" cy="50" r="45" fill="#fee2e2"/><line x1="33" y1="33" x2="67" y2="67" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/><line x1="67" y1="33" x2="33" y2="67" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>`
		default: // "successful" or any other value
			if verificationPending {
				heading = "Payment Received"
				body = "Your payment was received successfully, but confirmation is still processing. Return to the app to refresh your balance or use manual confirmation if it does not update yet."
				iconColor = "#f59e0b"
				iconSVG = `<circle cx="50" cy="50" r="45" fill="#fef3c7"/><path d="M50 26 L72 68 H28 Z" fill="#f59e0b"/><line x1="50" y1="40" x2="50" y2="55" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="62" r="3.5" fill="#fff"/>`
			} else {
				heading = "Payment Confirmed"
				body = "Your payment was confirmed successfully and your credits have already been added. Return to the app to see the updated balance."
				iconColor = "#0AADA2"
				iconSVG = `<circle cx="50" cy="50" r="45" fill="#ccfbf1"/><polyline points="28,50 44,66 72,36" fill="none" stroke="#0AADA2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
			}
		}

		html := `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LifeGate Payment</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0faf9;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:#fff;border-radius:20px;padding:40px 32px;max-width:420px;width:100%;
  text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
svg{margin-bottom:20px}
h1{font-size:22px;font-weight:800;color:#111827;margin-bottom:12px}
p{font-size:15px;color:#6b7280;line-height:1.6;margin-bottom:28px}
button{background:` + iconColor + `;color:#fff;border:none;border-radius:12px;
  padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer;width:100%}
button:hover{opacity:.88}
.note{margin-top:14px;font-size:13px;color:#9ca3af}
</style></head><body>
<div class="card">
  <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
			iconSVG + `</svg>
  <h1>` + heading + `</h1>
  <p>` + body + `</p>
  <button id="btn">Return to LifeGate</button>
  <p class="note" id="cd"></p>
</div>
<script>
(function(){
  var st="` + status + `"||"successful";
  var txRef="` + txRef + `";
	var flwTxId="` + flwTxID + `";
	var dl='lifegate://payment/callback?status='+encodeURIComponent(st)+'&tx_ref='+encodeURIComponent(txRef)+'&transaction_id='+encodeURIComponent(flwTxId);
	var fallbackDl='lifegate://settings/subscription?status='+encodeURIComponent(st)+'&tx_ref='+encodeURIComponent(txRef);
		function closeOrReturnOnWeb(){
			if(window.opener && !window.opener.closed){
				try{window.opener.focus();}catch(e){}
				window.close();
			}
			setTimeout(function(){ window.location.href=dl; }, 250);
			setTimeout(function(){ window.location.href=fallbackDl; }, 1200);
		}
	function returnToApp(){
			// Try closing web callback tab first, then deep-link back to app.
			// Browsers that block custom-scheme redirects get a secondary fallback route.
			closeOrReturnOnWeb();
	}
  // Notify opener tab (web flow opened via window.open).
  if(window.opener){try{window.opener.postMessage({type:'payment_complete',status:st},'*');}catch(e){}}
  // Button: redirect to deep-link (switches to app on mobile; harmless on desktop).
	document.getElementById('btn').onclick=returnToApp;
  // Auto-redirect countdown.
  var s=5;var t=setInterval(function(){
    document.getElementById('cd').textContent='Returning to app in '+s+'s\u2026';
		if(--s<0){clearInterval(t);returnToApp();}
  },1000);
})();
</script>
</body></html>`

		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
	})

	addr := ":" + cfg.Port
	log.Printf("LifeGate server starting on %s", addr)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// getEnvOrDefault returns the value of an environment variable or a fallback.
func getEnvOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
