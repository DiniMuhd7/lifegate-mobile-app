# LifeGate Backend

Go REST API backend for the LifeGate mobile health app.

## Prerequisites

- Go 1.24+
- PostgreSQL 14+
- Redis 7+
- NATS Server 2+

## Local Setup

```bash
# 1. Clone and navigate
cd backend

# 2. Copy and edit environment variables
cp .env.example .env
# Fill in your values

# 3. Install dependencies
go mod tidy

# 4. Run database migrations
make migrate

# 5. Start the server
make run
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `JWT_SECRET` | — | HS256 JWT signing secret |
| `JWT_EXPIRY` | `24h` | Token TTL (e.g. `24h`, `7d`) |
| `AI_PROVIDER` | `openai` | `openai` / `gemini` / `claude` / `auto` |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model name |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model name |
| `ANTHROPIC_API_KEY` | — | Anthropic Claude API key |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Claude model name |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | `noreply@lifegate.app` | From address for emails |
| `UPLOAD_DIR` | `./uploads` | Directory for certificate uploads |

## API Reference

All endpoints are prefixed with `/api`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Login with email/password |
| POST | `/auth/register` | No | Direct registration |
| POST | `/auth/register/start` | No | Start OTP registration (multipart) |
| POST | `/auth/register/verify` | No | Verify OTP and complete registration |
| POST | `/auth/register/resend` | No | Resend OTP |
| POST | `/auth/password/send-reset-code` | No | Send password reset code |
| POST | `/auth/password/verify-reset-code` | No | Verify reset code → resetToken |
| POST | `/auth/password/reset` | No | Reset password with token |
| GET | `/auth/me` | JWT | Get current user |

### AI Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/genai/chat` | JWT | Send message, receive AI health guidance |

### Physician

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/physician/reports` | JWT | Paginated diagnosis reports |
| GET | `/physician/stats` | JWT | Count stats by status |
| POST | `/physician/reports/:id/review` | JWT | Submit review for a report |

### Review / Analysis

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/review/analysis` | JWT | Daily diagnosis stats (query: `date` or `startDate`/`endDate`) |

### WebSocket

Connect to `ws://<host>/ws` for real-time events:
- `diagnosis.update:<json>`
- `physician.review.status:<json>`

## Switching AI Providers

Set `AI_PROVIDER` in `.env`:

```env
AI_PROVIDER=openai    # Use OpenAI GPT (default)
AI_PROVIDER=gemini    # Use Google Gemini
AI_PROVIDER=claude    # Use Anthropic Claude
AI_PROVIDER=auto      # Try OpenAI → Gemini → Claude (fallback chain)
```

## Build & Deploy

```bash
# Build binary
make build

# Build Docker image
docker build -t lifegate-backend .

# Run container
docker run -p 5000:5000 --env-file .env lifegate-backend
```

## Deploy to Render

1. Connect your GitHub repo to [Render](https://render.com).
2. Create a new **Web Service** pointing to the `backend/` directory.
3. Set **Build Command**: `go build -o lifegate-server ./cmd/server`
4. Set **Start Command**: `./lifegate-server`
5. Add all environment variables from `.env.example` in the Render dashboard.
6. Provision a **PostgreSQL** and **Redis** instance on Render and link their `DATABASE_URL` / `REDIS_URL`.