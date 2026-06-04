-- 057_physician_workspace.sql
-- Stores a human physician's editable AI workspace content.
-- When ai_mode_enabled = TRUE the OpenClaw worker loads these sections and
-- injects them into the system prompt instead of the generic fallback.
--
-- Editable sections (physician-owned):
--   identity_md  — personal profile, specialisation, languages, background
--   user_md      — communication style, tone, patient interaction philosophy
--   persona_md   — free-form personalisation layer injected last in the prompt
--
-- AGENT.md and SOUL.md are NOT stored here; they are immutable platform files
-- managed by LifeGate and are always injected from the server's filesystem
-- for built-in agents. For human AI-mode physicians, the platform enforces
-- the same safety constraints directly inside buildHumanAIReplyPrompt.

CREATE TABLE IF NOT EXISTS physician_workspace (
    physician_id  UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    identity_md   TEXT        NOT NULL DEFAULT '',
    user_md       TEXT        NOT NULL DEFAULT '',
    persona_md    TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
