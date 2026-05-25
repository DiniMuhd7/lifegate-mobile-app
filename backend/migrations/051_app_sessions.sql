-- 051_app_sessions.sql
-- Tracks per-user app engagement sessions (foreground → background).
-- Used to compute avg session duration, daily active session counts,
-- and engagement time breakdowns by role in the admin analytics dashboard.

CREATE TABLE IF NOT EXISTS app_sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          VARCHAR(50) NOT NULL DEFAULT 'patient',   -- patient | professional | admin
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    duration_secs INTEGER,                                  -- computed on end; NULL if session still open
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id    ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_started_at ON app_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_app_sessions_role       ON app_sessions(role);
