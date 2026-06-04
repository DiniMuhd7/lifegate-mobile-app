-- 050_physician_ai_mode.sql
-- Adds ai_mode_enabled flag to the users table so human physicians can
-- activate AI mode, causing their account to be handled by the OpenClaw
-- worker exactly like the 24 built-in AI physician agents.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index: the OpenClaw worker polls for active cases where the physician is
-- either a built-in AI agent (openclaw_agent_slug IS NOT NULL) OR a human
-- physician who has enabled AI mode.  This partial index keeps that query fast.
CREATE INDEX IF NOT EXISTS idx_users_ai_mode_enabled
  ON users (id)
  WHERE ai_mode_enabled = TRUE;
