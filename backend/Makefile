.PHONY: run build migrate test docker-build docker-run docker-migrate

# ── Local development ──────────────────────────────────────────────────────────
run:
	go run ./cmd/server

build:
	go build -o bin/lifegate-server ./cmd/server

test:
	go test ./...

# Run all migration files in order against DATABASE_URL
migrate:
	@for f in $$(ls migrations/*.sql | sort); do \
		echo "Applying $$f ..."; \
		psql "$(DATABASE_URL)" -f "$$f"; \
	done

# ── Docker (local build & test) ───────────────────────────────────────────────
IMAGE ?= lifegate-backend
TAG   ?= latest

# Build the production Docker image locally (mirrors what Render does).
docker-build:
	docker build -t $(IMAGE):$(TAG) .

# Run the container locally using backend/.env for environment variables.
docker-run:
	docker run --rm \
		--env-file .env \
		-p 5000:5000 \
		$(IMAGE):$(TAG)

# Apply all migrations against a running Postgres (DATABASE_URL must be set).
# Example:
#   export DATABASE_URL="postgres://user:pass@localhost:5432/lifegate?sslmode=disable"
#   make docker-migrate
docker-migrate:
	@for f in $$(ls migrations/*.sql | sort); do \
		echo "Applying $$f ..."; \
		psql "$(DATABASE_URL)" -f "$$f"; \
	done
