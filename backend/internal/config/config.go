package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	NatsURL     string

	JWTSecret          string
	JWTExpiry          string
	RefreshTokenExpiry string

	AIProvider string

	OpenAIAPIKey string
	OpenAIModel  string

	GeminiAPIKey string
	GeminiModel  string

	AnthropicAPIKey string
	AnthropicModel  string

	CodexModel      string
	ClaudeCodeModel string

	ResendAPIKey string
	EmailFrom    string
	SupportEmail string

	YouTubeAPIKey string

	// FirebaseAPIKey is used server-side to verify Firebase ID tokens
	// (Google Sign-In). Set FIREBASE_API_KEY on the environment.
	FirebaseAPIKey string

	UploadDir string

	FlutterwaveSecretKey   string
	FlutterwavePublicKey   string
	FlutterwaveRedirectURL string
	FlutterwaveWebhookHash string
	FXRateURL              string
	FXFallbackNGNPerUSD    float64
	FXCacheTTL             time.Duration

	// HealthDataKey is used to derive the AES-256 key for encrypting
	// sensitive health fields in the users table. Falls back to JWT_SECRET
	// when not explicitly set — override in production with a dedicated secret.
	HealthDataKey string

	// SwaggerHost overrides the Swagger UI host. Set to the public domain in
   // production (e.g. edis.dshub.com.ng). Leave empty to
	// auto-detect localhost for local development.
	SwaggerHost string

	// VAPID keys for Web Push (RFC 8292). Generate once with:
	//   go run ./scripts/gen_vapid/main.go
	// VAPIDPublicKey is also exposed to the frontend via GET /api/vapid-public-key.
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string // mailto: or https: contact URI
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, reading environment variables directly")
	}

	// Production safety: refuse to start with known-insecure defaults.
	// GIN_MODE=release is set in render.yaml and any production deployment.
	if strings.ToLower(os.Getenv("GIN_MODE")) == "release" {
		jwtSecret := os.Getenv("JWT_SECRET")
		if jwtSecret == "" || jwtSecret == "changeme-secret" {
			log.Fatal("FATAL: JWT_SECRET must be set to a strong random secret in production (GIN_MODE=release)")
		}
		healthKey := os.Getenv("HEALTH_DATA_KEY")
		if healthKey == "" || healthKey == "changeme-secret" || healthKey == jwtSecret {
			log.Fatal("FATAL: HEALTH_DATA_KEY must be set to a dedicated strong random secret in production, separate from JWT_SECRET")
		}
	}

	provider := getEnv("AI_PROVIDER", "openai")
	provider = strings.ToLower(strings.TrimSpace(provider))

	return &Config{
		Port:        getEnv("PORT", "5000"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/lifegate?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		NatsURL:     getEnv("NATS_URL", "nats://localhost:4222"),

		JWTSecret:          getEnv("JWT_SECRET", "changeme-secret"),
		JWTExpiry:          getEnv("JWT_EXPIRY", "15m"),
		RefreshTokenExpiry: getEnv("REFRESH_TOKEN_EXPIRY", "168h"),

		AIProvider: provider,

		OpenAIAPIKey: getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:  getEnv("OPENAI_MODEL", "gpt-4o"),

		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),
		GeminiModel:  getEnv("GEMINI_MODEL", "gemini-1.5-flash"),

		AnthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
		AnthropicModel:  getEnv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),

		CodexModel:      getEnv("CODEX_MODEL", "codex-mini-latest"),
		ClaudeCodeModel: getEnv("CLAUDE_CODE_MODEL", "claude-opus-4-5"),

		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		EmailFrom:    getEnv("EMAIL_FROM", "noreply@dshub.com.ng"),
		SupportEmail: getEnv("SUPPORT_EMAIL", "contact@dshub.com.ng"),

		YouTubeAPIKey: getEnv("YOUTUBE_DATA_API_KEY", ""),

		FirebaseAPIKey: getEnv("FIREBASE_API_KEY", ""),

		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),

		FlutterwaveSecretKey:   getEnv("FLW_SECRET_KEY", ""),
		FlutterwavePublicKey:   getEnv("FLW_PUBLIC_KEY", ""),
		FlutterwaveRedirectURL: getEnv("FLW_REDIRECT_URL", ""),
		FlutterwaveWebhookHash: getEnv("FLW_WEBHOOK_HASH", ""),
		FXRateURL:              getEnv("FX_RATE_URL", "https://open.er-api.com/v6/latest/USD"),
		FXFallbackNGNPerUSD:    getEnvFloat("FX_FALLBACK_NGN_PER_USD", 1600),
		FXCacheTTL:             getEnvDuration("FX_CACHE_TTL", 30*time.Minute),

		HealthDataKey: getEnv("HEALTH_DATA_KEY", getEnv("JWT_SECRET", "changeme-secret")),

		SwaggerHost: getEnv("SWAGGER_HOST", ""),

		VAPIDPublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:    getEnv("VAPID_SUBJECT", "mailto:contact@dshub.com.ng"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func getEnvFloat(key string, defaultVal float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultVal
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return defaultVal
	}
	return parsed
}

func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultVal
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return defaultVal
	}
	return parsed
}
