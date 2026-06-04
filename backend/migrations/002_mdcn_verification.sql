-- Migration: Add MDCN license verification tracking to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mdcn_verified     BOOLEAN                  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mdcn_verified_at  TIMESTAMP WITH TIME ZONE          DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_mdcn_verified ON users(mdcn_verified);
