-- Migration 010: Physician account management
-- Adds account status, flag tracking, and MDCN override columns plus SLA breach log.

-- ── Account management columns on users ────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status     VARCHAR(20)  NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS flagged            BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS flagged_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS flagged_reason     TEXT,
    ADD COLUMN IF NOT EXISTS mdcn_override_status VARCHAR(20),   -- 'confirmed' | 'rejected' | NULL
    ADD COLUMN IF NOT EXISTS mdcn_override_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mdcn_override_at   TIMESTAMPTZ;

-- account_status domain: 'active' | 'suspended'
CREATE INDEX IF NOT EXISTS idx_users_account_status
    ON users(account_status)
    WHERE role = 'professional';

CREATE INDEX IF NOT EXISTS idx_users_flagged
    ON users(flagged)
    WHERE role = 'professional' AND flagged = TRUE;

-- ── Track when a physician accepted a case (for physician-side SLA) ────────
ALTER TABLE diagnoses
    ADD COLUMN IF NOT EXISTS physician_assigned_at TIMESTAMPTZ;

-- ── SLA breach log ─────────────────────────────────────────────────────────
-- A row is inserted each time a physician's Active case exceeds the SLA
-- deadline at completion time.
CREATE TABLE IF NOT EXISTS physician_sla_breaches (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    physician_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id       UUID        NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
    hours_over_sla NUMERIC(6,2) NOT NULL DEFAULT 0,
    breached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(physician_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_sla_breaches_physician
    ON physician_sla_breaches(physician_id, breached_at DESC);
