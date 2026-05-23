# Build stage
# Build context must be the repo root (.) so that both backend source and the
# lifegate-openclaw/agents persona files are available.
FROM golang:1.24-alpine AS builder
WORKDIR /app
# Copy backend Go module files first for better layer caching.
COPY backend/go.mod backend/go.sum ./
RUN go mod download
# Copy backend source code.
COPY backend/ .
# Copy OpenClaw agent persona files — required at runtime by the AI physician worker.
COPY lifegate-openclaw/agents ./agents

RUN CGO_ENABLED=0 GOOS=linux go build -o lifegate-server ./cmd/server

# Final stage
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/lifegate-server .
# Include the OpenClaw agent persona files in the final image.
COPY --from=builder /app/agents ./agents
RUN mkdir -p uploads
EXPOSE 5000
CMD ["./lifegate-server"]