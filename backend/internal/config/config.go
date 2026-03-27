package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	NatsURL     string

	JWTSecret string
	JWTExpiry string

	AIProvider string

	OpenAIAPIKey string
	OpenAIModel  string

	GeminiAPIKey string
	GeminiModel  string

	AnthropicAPIKey string
	AnthropicModel  string

	CodexModel      string
	ClaudeCodeModel string

	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string

	UploadDir string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, reading environment variables directly")
	}

	provider := getEnv("AI_PROVIDER", "openai")
	provider = strings.ToLower(strings.TrimSpace(provider))

	return &Config{
		Port:        getEnv("PORT", "5000"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/lifegate?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		NatsURL:     getEnv("NATS_URL", "nats://localhost:4222"),

		JWTSecret: getEnv("JWT_SECRET", "changeme-secret"),
		JWTExpiry: getEnv("JWT_EXPIRY", "24h"),

		AIProvider: provider,

		OpenAIAPIKey: getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:  getEnv("OPENAI_MODEL", "gpt-4o"),

		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),
		GeminiModel:  getEnv("GEMINI_MODEL", "gemini-1.5-flash"),

		AnthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
		AnthropicModel:  getEnv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),

		CodexModel:      getEnv("CODEX_MODEL", "codex-mini-latest"),
		ClaudeCodeModel: getEnv("CLAUDE_CODE_MODEL", "claude-opus-4-5"),

		SMTPHost:     getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@lifegate.app"),

		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
