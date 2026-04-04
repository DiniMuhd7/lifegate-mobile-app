// Package migrations embeds all SQL migration files into the binary so they
// are available at runtime without requiring the files to be present on disk.
// This is required for production deployments (e.g. Render) where the Docker
// image only contains the compiled binary.
package migrations

import "embed"

// FS holds every *.sql file in this directory, embedded at compile time.
//
//go:embed *.sql
var FS embed.FS
