-- Migration 031: Account deletion scheduling
-- Users can request account deletion. Data will be permanently removed after 90 days
-- unless the user cancels the request within that window.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
    ON users(deletion_scheduled_at)
    WHERE deletion_scheduled_at IS NOT NULL;
