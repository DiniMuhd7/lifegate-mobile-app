# LifeGate

**LifeGate by DHSub** — an AI-assisted digital health platform combining conversational AI triage with mandatory physician validation for clinical cases.

---

## Monorepo Structure

```
lifegate-mobile-app/
├── mobile/      # Expo React Native app (TypeScript, NativeWind, Zustand)
├── backend/     # Go HTTP API (Gin, PostgreSQL, Redis, NATS)
└── docs/        # Project documentation
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| npm | 9+ |
| Go | 1.24+ |
| Expo CLI | latest (`npm i -g expo-cli`) |

---

## Getting Started

### Mobile App

```bash
cd mobile
npm install
npx expo start
```

### Backend

```bash
cd backend
cp .env.example .env   # fill in real values
make run
```

---

## Environment Variables

### Mobile (`mobile/.env`)

See [`mobile/.env.example`](mobile/.env.example) for all variables.

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Base URL for the Go backend API |

### Backend (`backend/.env`)

See [`backend/.env.example`](backend/.env.example) for all variables.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile framework | Expo (React Native) + Expo Router |
| Styling | NativeWind (Tailwind CSS for React Native) |
| State management | Zustand |
| HTTP client | Axios |
| AI providers | Google Gemini, OpenAI, Claude (via backend) |
| Backend language | Go 1.24 |
| Web framework | Gin |
| Database | PostgreSQL |
| Cache | Redis |
| Messaging | NATS / JetStream |

---

## Local Development with Docker

Start the full infrastructure stack:

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, and NATS locally. Then configure and run the backend:

```bash
cd backend && make run
```

---

## Documentation

- [Backend README](backend/README.md) — detailed backend setup, API reference, and architecture
- [Product Requirements Document](docs/LifeGate-PRD.md)
- [Validation Implementation](docs/VALIDATION_IMPLEMENTATION.md)
