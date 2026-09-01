# Deploying LifeGate to Render

End-to-end guide to deploy the LifeGate backend on **Render** and build the mobile app with **EAS Build**, starting from zero.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Git | any | `brew install git` / `apt install git` |
| Go | ≥ 1.24 | https://go.dev/dl/ |
| Node.js | ≥ 20 | https://nodejs.org |
| Expo CLI + EAS CLI | latest | `npm i -g expo-cli eas-cli` |
| `psql` (optional) | any | needed only for manual migration |

Accounts required:
- [Render](https://render.com) (free tier is enough to start)
- [GitHub](https://github.com) (repo must be connected to Render)
- An OpenAI / Gemini / Anthropic API key for the AI provider you want to use
- A Gmail App Password **or** a transactional email account (Resend, SendGrid, etc.) for SMTP

---

## Part 1 — Backend on Render

### Step 1 — Fork / push the repo to GitHub

Render deploys directly from a GitHub (or GitLab) repository.

```bash
# If you cloned from somewhere else, push to your own GitHub remote:
git remote set-url origin https://github.com/<you>/lifegate-mobile-app.git
git push -u origin main
```

---

### Step 2 — Deploy with the Render Blueprint (recommended)

The `render.yaml` file at the repo root is a **Blueprint** that provisions every resource automatically.

1. Go to [dashboard.render.com/select-repo](https://dashboard.render.com/select-repo).
2. Connect your GitHub account and select the `lifegate-mobile-app` repository.
3. Render detects `render.yaml` and shows a summary of resources it will create:
   - `lifegate-backend` — Web Service (Docker)
   - `lifegate-db` — Managed PostgreSQL
   - `lifegate-redis` — Managed Redis
   - `lifegate-nats` — Private Service (NATS JetStream)
4. Click **Apply**.

Render will prompt you to fill in the **secret environment variables** marked as `sync: false` before the first deploy starts. Enter each one now (see the table in Step 3 below).

> **Alternative — manual setup**: If you prefer to create each service by hand, skip to the [Manual Setup](#appendix-a--manual-setup-without-blueprint) appendix at the bottom.

---

### Step 3 — Set the secret environment variables

In the Render dashboard, open the `lifegate-backend` service → **Environment** tab and set the following. Variables already handled by the Blueprint (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, etc.) are listed here for reference only.

| Variable | Where to get it | Required |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | If `AI_PROVIDER=openai` |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | If `AI_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | If `AI_PROVIDER=anthropic` |
| `SMTP_USER` | Your Gmail address or transactional email sender | Yes |
| `SMTP_PASSWORD` | Gmail → [App Password](https://myaccount.google.com/apppasswords) · Resend/SendGrid → SMTP key | Yes |
| `ALLOWED_ORIGINS` | Comma-separated list of client origins. Start with your Render backend URL: `https://lifegatemobilebackend-2.onrender.com` | Yes |

> Choose only **one** AI provider and leave the others blank. Set `AI_PROVIDER` to match the key you supplied.

To generate a standalone JWT secret locally:
```bash
openssl rand -hex 32
```
The Blueprint uses `generateValue: true` so Render generates one automatically — you do not need to set it manually.

---

### Step 4 — Wait for the first build

Render builds the Docker image from `backend/Dockerfile`. The first build takes 3–5 minutes.

Watch the **Logs** tab in the dashboard. A successful startup looks like:

```
[GIN-debug] Listening and serving HTTP on :5000
```

If the build fails, the most common causes are:
- A missing required secret (check the logs for `FATAL:` lines).
- The free-tier Postgres/Redis not yet healthy when the backend starts — Render retries automatically.

---

### Step 5 — Run database migrations

Render's managed Postgres starts empty. Apply the migrations once after the first deploy.

**Option A — Render Shell (no local tools needed)**

1. Open the `lifegate-backend` service in the dashboard.
2. Click **Shell** (top-right).
3. Inside the shell run:

```bash
psql "$DATABASE_URL" -f /dev/stdin <<'SQL'
-- paste the contents of migrations/001_initial_schema.sql here
SQL
```

**Option B — from your local machine**

Copy the `DATABASE_URL` from Render → Environment tab, then:

```bash
export DATABASE_URL="postgres://lifegate_user:<password>@<host>:5432/lifegate?sslmode=require"

psql "$DATABASE_URL" -f backend/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f backend/migrations/002_add_mdcn_verified.sql
psql "$DATABASE_URL" -f backend/migrations/003_add_escalated_to_diagnoses.sql
```

Run each file **in order**. Migration `002_mdcn_verification.sql` is a duplicate of `002_add_mdcn_verified.sql` — apply whichever is relevant to your schema version; both are idempotent (`IF NOT EXISTS` / `IF NOT EXISTS`).

---

### Step 6 — Verify the health endpoint

```bash
curl https://lifegatemobilebackend-2.onrender.com/health
# Expected: 200 OK
```

> The free-tier web service **spins down after 15 minutes of inactivity**. The first request after a cold start may take ~30 s. Upgrade to the Starter plan to avoid this.

---

## Part 2 — Expo Web on Render (Public URL)

### Step 7 — Build the web app locally once

```bash
cd mobile
npm ci
npm run export:web
```

This generates a static Expo web build in `mobile/dist`. The command was verified against the current app and completes successfully with Expo Router.

---

### Step 8 — Deploy the static site from `render.yaml`

The Blueprint now provisions a second Render service named `lifegate-mobile-web`:

- Type: Static Site
- Root directory: `mobile`
- Build command: `npm ci && npm run export:web`
- Publish directory: `dist`

After you apply the Blueprint in Render, the site will be available at:

```text
https://lifegate.dshub.com.ng
```

The static site uses a rewrite rule to `/index.html`, so Expo Router deep links continue to work.

---

### Step 9 — Set backend CORS for the public web URL

In the Render dashboard, open `lifegate-backend` → **Environment** and set `ALLOWED_ORIGINS` to include the web site origin:

```env
ALLOWED_ORIGINS=https://lifegate.dshub.com.ng
```

If you also use Expo Go or another frontend origin, add them as a comma-separated list.

---

### Step 10 — Verify the live site

Open the public URL and confirm:

- The app shell loads without a blank screen.
- API requests go to `https://edis.dshub.com.ng/api`.
- Refreshing a nested route still resolves correctly.

---

## Part 3 — Mobile App (EAS Build)

### Step 11 — Install dependencies

```bash
cd mobile
npm ci
```

---

### Step 12 — Set the production API URL

Create `mobile/.env.production` with:

```env
EXPO_PUBLIC_API_URL=https://lifegatemobilebackend-2.onrender.com/api
```

If your Render service was given a different name, update this URL to match the **External URL** shown on the service dashboard.

---

### Step 13 — Configure EAS

```bash
# Log in to your Expo account
eas login

# Link the local project to your Expo account (one-time)
eas build:configure
```

The `eas.json` already has a `production` build profile. Confirm `app.json` has the correct `slug` and `owner` for your Expo account.

---

### Step 14 — Build for production

```bash
# Android APK / AAB
eas build --platform android --profile production

# iOS (requires Apple Developer account)
eas build --platform ios --profile production

# Both platforms at once
eas build --platform all --profile production
```

EAS injects `EXPO_PUBLIC_API_URL` from `mobile/.env.production` automatically at build time.

---

### Step 15 — Download and test the build

After the build completes (~10–15 min), EAS prints a download URL. Install the APK on a device and verify:

- Registration / login flow works end-to-end.
- AI diagnosis chat sends and receives responses.
- WebSocket connection stays live.

---

## Part 4 — Custom Domain (optional)

1. In the Render dashboard, open `lifegate-backend` → **Settings** → **Custom Domains**.
2. Add your domain (e.g. `api.lifegate.app`) and copy the CNAME value.
3. Add the CNAME record in your DNS provider.
4. After DNS propagates, update `ALLOWED_ORIGINS` on Render and `EXPO_PUBLIC_API_URL` in `mobile/.env.production`, then trigger a new EAS build.

---

## Environment Variable Reference

### Backend (`backend/.env.production`)

| Variable | Default in Blueprint | Description |
|---|---|---|
| `PORT` | `5000` | Port the server listens on |
| `GIN_MODE` | `release` | Set to `release` in production |
| `DATABASE_URL` | auto-injected | Render managed Postgres connection string |
| `REDIS_URL` | auto-injected | Render managed Redis connection string |
| `NATS_URL` | `nats://lifegate-nats:4222` | Internal NATS private service address |
| `JWT_SECRET` | auto-generated | ≥ 32 chars, used to sign auth tokens |
| `JWT_EXPIRY` | `24h` | Token lifetime |
| `AI_PROVIDER` | `openai` | `openai` \| `gemini` \| `anthropic` |
| `OPENAI_API_KEY` | — | Required if `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model name |
| `GEMINI_API_KEY` | — | Required if `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model name |
| `ANTHROPIC_API_KEY` | — | Required if `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic model name |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP relay host |
| `SMTP_PORT` | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | — | Sender email address |
| `SMTP_PASSWORD` | — | App Password or SMTP API key |
| `SMTP_FROM` | `noreply@lifegate.app` | From address on outbound emails |
| `ALLOWED_ORIGINS` | — | Comma-separated allowed CORS origins |
| `UPLOAD_DIR` | `/app/uploads` | Persistent disk mount path |

### Web Static Site (Render)

| Variable | Value | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://edis.dshub.com.ng/api` | Backend API base URL embedded into the static web build |

### Mobile (`mobile/.env.production`)

| Variable | Value | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://lifegatemobilebackend-2.onrender.com/api` | Backend API base URL (embedded at build time) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `FATAL: JWT_SECRET must be at least 32 characters` | Set `JWT_SECRET` to a 32+ char string in Render Environment tab |
| Backend crashes with `dial tcp: no route to host` on NATS | Ensure `lifegate-nats` private service is deployed and healthy before backend starts |
| `connection refused` on Postgres/Redis | Free-tier services may take a few seconds to start; Render retries automatically |
| CORS error in the mobile app | Add your exact origin to `ALLOWED_ORIGINS` (no trailing slash) |
| App shows "Network request failed" | Verify `EXPO_PUBLIC_API_URL` ends with `/api` and matches your Render external URL |
| Uploaded files missing after redeploy | Confirm the persistent disk is attached at `/app/uploads` and `UPLOAD_DIR=/app/uploads` |

---

## Appendix A — Manual Setup (without Blueprint)

If you prefer to create each Render resource by hand instead of using `render.yaml`:

1. **PostgreSQL** → New → PostgreSQL → name `lifegate-db`, region Oregon, plan Free.
2. **Redis** → New → Redis → name `lifegate-redis`, region Oregon, plan Free.
3. **NATS** → New → Private Service → runtime Docker, image `nats:2.10-alpine`, start command `--jetstream -m 8222`, name `lifegate-nats`.
4. **Backend** → New → Web Service → connect repo → runtime Docker, Dockerfile path `./backend/Dockerfile`, Docker context `./backend`.
   - Add all environment variables from the table above.
   - Under **Advanced** → **Disks**, add a disk named `lifegate-uploads` mounted at `/app/uploads`.

Then run the migrations as described in Step 5.
