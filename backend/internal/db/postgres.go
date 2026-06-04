package db

import (
	"database/sql"
	"log"
	"time"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) *sql.DB {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("Failed to open database connection: %v", err)
	}

	// Retry logic: Render's managed Postgres may take 5-10 seconds to initialize
	const maxRetries = 30
	const retryDelay = 1 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if err := db.Ping(); err == nil {
			log.Println("Connected to PostgreSQL")
			return db
		}
		if attempt < maxRetries {
			log.Printf("Database not ready yet (attempt %d/%d). Retrying in %v...", attempt, maxRetries, retryDelay)
			time.Sleep(retryDelay)
		}
	}

	log.Fatalf("Failed to ping database after %d retries: %v", maxRetries, err)
	return nil
}