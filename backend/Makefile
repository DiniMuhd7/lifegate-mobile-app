.PHONY: run build migrate test

run:
go run ./cmd/server

build:
go build -o bin/lifegate-server ./cmd/server

migrate:
psql "$(DATABASE_URL)" -f migrations/001_initial_schema.sql

test:
go test ./...
