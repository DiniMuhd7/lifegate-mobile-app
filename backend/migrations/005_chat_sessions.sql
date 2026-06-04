-- 005_chat_sessions.sql
-- Server-side chat session persistence with status lifecycle management.

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,
    category    VARCHAR(50),
    mode        VARCHAR(50),
    -- Lifecycle: active → abandoned (app closed mid-session, TTL 24h via Redis)
    --                 → completed (user explicitly finished or dismissed resume prompt)
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    messages    JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id
    ON chat_sessions (user_id);

-- Partial index for the "find abandoned session" query used by GetIncomplete.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_abandoned
    ON chat_sessions (user_id, updated_at DESC)
    WHERE status = 'abandoned';
