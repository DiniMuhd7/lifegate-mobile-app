-- 045_scan_usage.sql
-- Tracks daily document scan usage per user for the 5/day free-tier limit.

CREATE TABLE IF NOT EXISTS scan_usage (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       DATE        NOT NULL DEFAULT CURRENT_DATE,
    count      INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_scan_usage_user_date ON scan_usage (user_id, date);
