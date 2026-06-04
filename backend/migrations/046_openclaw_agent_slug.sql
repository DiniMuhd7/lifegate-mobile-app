-- Migration 046: Add openclaw_agent_slug to users table.
-- Links a physician account to its OpenClaw AI agent definition directory.
-- NULL for regular patients; set to the agent's slug for all AI-backed physicians.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS openclaw_agent_slug VARCHAR(100) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_openclaw_agent_slug
    ON users(openclaw_agent_slug)
    WHERE openclaw_agent_slug IS NOT NULL;

COMMENT ON COLUMN users.openclaw_agent_slug IS
    'OpenClaw agent slug (e.g. dr-ahmed-musa). Maps to lifegate-openclaw/agents/<slug>/.';
