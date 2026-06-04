package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"sort"
)

// RunMigrations applies any SQL migration files that have not yet been applied,
// using a schema_migrations tracking table to ensure idempotency. Migration
// files must be passed as an fs.FS (typically the embedded migrations.FS) and
// are applied in lexicographic (filename) order.
func RunMigrations(database *sql.DB, migrationsFS fs.FS) error {
	// Create the tracking table if it doesn't exist yet.
	_, err := database.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	// Collect all .sql files from the embedded FS.
	entries, err := fs.ReadDir(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && len(e.Name()) > 4 && e.Name()[len(e.Name())-4:] == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, name := range files {
		// Check if this migration has already been applied.
		var count int
		if err := database.QueryRow(
			`SELECT COUNT(*) FROM schema_migrations WHERE filename = $1`, name,
		).Scan(&count); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if count > 0 {
			continue // already applied
		}

		content, err := fs.ReadFile(migrationsFS, name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		log.Printf("[migrate] applying %s ...", name)
		if _, err := database.Exec(string(content)); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}

		if _, err := database.Exec(
			`INSERT INTO schema_migrations (filename) VALUES ($1)`, name,
		); err != nil {
			return fmt.Errorf("record migration %s: %w", name, err)
		}

		log.Printf("[migrate] applied  %s", name)
	}

	return nil
}
