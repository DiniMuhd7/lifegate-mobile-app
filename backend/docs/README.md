# LifeGate API — Swagger Documentation

## Accessing the Swagger UI

Once the backend is running, the interactive API explorer is available at:

```
http://localhost:8080/swagger/index.html
```

On production (Render):

```
https://lifegatemobilebackend-2.onrender.com/swagger/index.html
```

---

## Authentication

All protected routes require a Bearer JWT token. Obtain a token via:

- `POST /api/auth/login` — for patients
- `POST /api/auth/login` + `POST /api/auth/login/verify-2fa` — for physicians (2FA flow)

In the Swagger UI, click **Authorize** (top right) and enter:

```
Bearer <your_token>
```

---

## API Groups (Tags)

| Tag             | Base Path              | Description                                               |
|-----------------|------------------------|-----------------------------------------------------------|
| `auth`          | `/api/auth`            | Registration, login, 2FA, password reset, profile        |
| `genai`         | `/api/genai`           | Stateless AI chat, provider health check, status         |
| `chat-sessions` | `/api/chat/sessions`   | Session-based AI chat and finalization                   |
| `physician`     | `/api/physician`       | Reports, stats, case queue, reviews, earnings, payouts   |
| `review`        | `/api/review`          | Physician-facing diagnosis analysis and history          |
| `diagnoses`     | `/api/diagnoses`       | Patient-facing diagnosis records                         |
| `alerts`        | `/api/alerts`          | Patient preventive alerts and physician workload alerts  |
| `payments`      | `/api/payments`        | Credit bundles, payment initiation, verification, history|
| `sessions`      | `/api/sessions`        | Chat session CRUD                                        |
| `admin`         | `/api/admin`           | Dashboard, SLA, physicians, audit, compliance, settings  |

---

## Route Summary

### Auth (`/api/auth`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| POST   | `/auth/login`                     | —    | Login with email + password          |
| POST   | `/auth/login/verify-2fa`          | —    | Verify physician 2FA OTP             |
| POST   | `/auth/login/resend-2fa`          | —    | Resend physician 2FA OTP             |
| POST   | `/auth/register`                  | —    | Instant patient registration         |
| POST   | `/auth/register/start`            | —    | Start OTP-verified registration      |
| POST   | `/auth/register/verify`           | —    | Verify registration OTP              |
| POST   | `/auth/register/resend`           | —    | Resend registration OTP              |
| POST   | `/auth/password/send-reset-code`  | —    | Send password reset code             |
| POST   | `/auth/password/verify-reset-code`| —    | Verify reset code → reset token      |
| POST   | `/auth/password/reset`            | —    | Reset password with token            |
| GET    | `/auth/me`                        | ✓    | Get authenticated user profile       |
| PUT    | `/auth/change-password`           | ✓    | Change password                      |
| PATCH  | `/auth/mdcn-verify`               | ✓    | Confirm MDCN license (physicians)    |

### GenAI (`/api/genai`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| POST   | `/genai/chat`                     | ✓    | Stateless AI chat                    |
| POST   | `/genai/health-check`             | ✓    | Ping the AI provider                 |
| GET    | `/genai/status`                   | ✓    | AI provider name and status          |

### Chat Sessions (`/api/chat/sessions`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| POST   | `/chat/sessions/{id}/ai-message`  | ✓    | Send AI message in a session         |
| POST   | `/chat/sessions/{id}/finalize`    | ✓    | Finalize session, generate report    |

### Physician (`/api/physician`)

| Method | Path                              | Auth          | Description                          |
|--------|-----------------------------------|---------------|--------------------------------------|
| GET    | `/physician/reports`              | ✓ physician   | Paginated report list                |
| GET    | `/physician/stats`                | ✓ physician   | Activity statistics                  |
| POST   | `/physician/reports/{id}/review`  | ✓ physician   | Submit review decision               |
| GET    | `/physician/cases`                | ✓ physician   | Case queue (pending/active/done)     |
| GET    | `/physician/cases/{id}`           | ✓ physician   | Full case detail                     |
| POST   | `/physician/cases/{id}/take`      | ✓ physician   | Claim a pending case                 |
| PATCH  | `/physician/cases/{id}/ai`        | ✓ physician   | Edit AI output inline                |
| GET    | `/physician/patients/{id}`        | ✓ physician   | Patient health profile               |
| GET    | `/physician/earnings`             | ✓ physician   | Earnings summary                     |
| GET    | `/physician/earnings/history`     | ✓ physician   | Paginated earnings history           |
| GET    | `/physician/payouts`              | ✓ physician   | Payout records                       |
| GET    | `/physician/alerts`               | ✓             | Physician workload alerts            |

### Review (`/api/review`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| GET    | `/review/analysis`                | ✓    | Diagnosis analysis (date range)      |
| GET    | `/review/diagnoses`               | ✓    | Physician diagnosis list             |
| GET    | `/review/diagnoses/{id}`          | ✓    | Single diagnosis detail              |

### Diagnoses (`/api/diagnoses`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| GET    | `/diagnoses`                      | ✓    | Patient diagnosis list               |
| GET    | `/diagnoses/{id}`                 | ✓    | Single diagnosis detail              |

### Alerts

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| GET    | `/alerts`                         | ✓    | Patient preventive alerts            |

### Payments & Credits

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| GET    | `/payments/bundles`               | ✓    | Available credit bundles             |
| POST   | `/payments/initiate`              | ✓    | Create Flutterwave payment link      |
| POST   | `/payments/verify`                | ✓    | Verify payment and credit account    |
| GET    | `/payments/transactions`          | ✓    | User payment history                 |
| GET    | `/credits/balance`                | ✓    | Current credit balance               |

### Sessions (`/api/sessions`)

| Method | Path                              | Auth | Description                          |
|--------|-----------------------------------|------|--------------------------------------|
| POST   | `/sessions`                       | ✓    | Create chat session                  |
| GET    | `/sessions`                       | ✓    | List all sessions                    |
| GET    | `/sessions/incomplete`            | ✓    | Get most recent incomplete session   |
| GET    | `/sessions/{id}`                  | ✓    | Get session by ID                    |
| PUT    | `/sessions/{id}`                  | ✓    | Update session                       |
| DELETE | `/sessions/{id}`                  | ✓    | Delete session                       |

### Admin (`/api/admin`) — requires `role=admin`

| Method | Path                                     | Description                          |
|--------|------------------------------------------|--------------------------------------|
| GET    | `/admin/dashboard`                       | Overview statistics                  |
| GET    | `/admin/cases`                           | Filtered, paginated case list        |
| GET    | `/admin/sla`                             | Active SLA report                    |
| GET    | `/admin/sla/breach-alerts`               | Recent SLA breach events             |
| GET    | `/admin/sla/reassignment-log`            | Auto-reassignment log                |
| GET    | `/admin/metrics/edis`                    | AI accuracy metrics                  |
| GET    | `/admin/physicians`                      | All physicians                       |
| POST   | `/admin/physicians`                      | Create physician account             |
| POST   | `/admin/physicians/flag-check`           | Trigger SLA flag check               |
| GET    | `/admin/physicians/{id}`                 | Physician detail                     |
| PATCH  | `/admin/physicians/{id}`                 | Update physician                     |
| DELETE | `/admin/physicians/{id}`                 | Delete physician                     |
| POST   | `/admin/physicians/{id}/suspend`         | Suspend physician                    |
| POST   | `/admin/physicians/{id}/unsuspend`       | Reinstate physician                  |
| POST   | `/admin/physicians/{id}/mdcn-override`   | Override MDCN verification status    |
| GET    | `/admin/audit`                           | Filtered audit event log             |
| GET    | `/admin/audit/export`                    | Download audit log as CSV            |
| GET    | `/admin/transactions`                    | All payment transactions             |
| GET    | `/admin/transactions/export`             | Download transactions as CSV         |
| GET    | `/admin/compliance/ndpa`                 | NDPA 2023 compliance snapshots       |
| POST   | `/admin/compliance/ndpa/generate`        | Generate new compliance snapshot     |
| GET    | `/admin/compliance/ndpa/export`          | Download compliance report as CSV    |
| GET    | `/admin/settings/alerts`                 | Alert threshold configuration        |
| PATCH  | `/admin/settings/alerts/{key}`           | Update a threshold value             |

### System

| Method | Path             | Auth | Description                          |
|--------|------------------|------|--------------------------------------|
| GET    | `/health`        | —    | Liveness probe (DB + Redis + NATS)   |
| GET    | `/health/ready`  | —    | Readiness probe (DB ping required)   |
| GET    | `/ws`            | —    | WebSocket upgrade (real-time hub)    |

---

## Regenerating the Docs

After modifying handler annotations, regenerate with:

```bash
cd backend
swag init -g cmd/server/main.go -o docs/
```

This updates `docs/docs.go`, `docs/swagger.json`, and `docs/swagger.yaml`.

> Install the CLI once with: `go install github.com/swaggo/swag/cmd/swag@latest`

---

## Generated Files

| File              | Description                                            |
|-------------------|--------------------------------------------------------|
| `docs.go`         | Embedded Go package imported by `main.go`             |
| `swagger.json`    | OpenAPI 2.0 spec in JSON format                       |
| `swagger.yaml`    | OpenAPI 2.0 spec in YAML format (human-readable)      |
