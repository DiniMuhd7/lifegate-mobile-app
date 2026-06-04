-- Migration 013: Performance indexes and health-data encryption column
-- Adds composite and partial indexes for the most common query patterns
-- across physician queues, audit logs, and payment transactions.

-- ── Diagnoses (physician case queue) ─────────────────────────────────────────
-- Physician queue view: (status, physician_id) WHERE status IN ('Pending','Active')
CREATE INDEX IF NOT EXISTS idx_diagnoses_status_physician
    ON diagnoses (status, physician_id);

-- SLA enforcement scan: (status, created_at) for time-window breach detection
CREATE INDEX IF NOT EXISTS idx_diagnoses_status_created
    ON diagnoses (status, created_at)
    WHERE status IN ('Pending', 'Active');

-- Urgency routing within physician queues
CREATE INDEX IF NOT EXISTS idx_diagnoses_urgency_status
    ON diagnoses (urgency, status);

-- ── Audit events ──────────────────────────────────────────────────────────────
-- Common query: filter by event_type DESC created_at (audit log viewer)
CREATE INDEX IF NOT EXISTS idx_audit_events_type_created
    ON audit_events (event_type, created_at DESC);

-- Actor-scoped lookup (single physician's or admin's trail)
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
    ON audit_events (actor_id, created_at DESC);

-- ── Payment transactions ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_tx_status_created
    ON payment_transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_tx_user_created
    ON payment_transactions (user_id, created_at DESC);

-- ── SLA breach log ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sla_reassignment_created
    ON sla_reassignment_log (created_at DESC);

-- ── Users ─────────────────────────────────────────────────────────────────────
-- Active physician lookup for SLA auto-reassign
CREATE INDEX IF NOT EXISTS idx_users_role_available
    ON users (role)
    WHERE role = 'physician';

-- ── Encrypted health data ─────────────────────────────────────────────────────
-- Add encrypted columns for sensitive freetext health fields.
-- Application layer (internal/crypto) writes AES-256-GCM ciphertext here;
-- _plain columns are deprecated and will be removed after data migration.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS health_history_enc     TEXT,
    ADD COLUMN IF NOT EXISTS medical_history_enc    TEXT,
    ADD COLUMN IF NOT EXISTS allergies_enc          TEXT,
    ADD COLUMN IF NOT EXISTS current_medications_enc TEXT;

COMMENT ON COLUMN users.health_history_enc      IS 'AES-256-GCM encrypted, base64url-encoded health history';
COMMENT ON COLUMN users.medical_history_enc     IS 'AES-256-GCM encrypted, base64url-encoded medical history';
COMMENT ON COLUMN users.allergies_enc           IS 'AES-256-GCM encrypted, base64url-encoded allergies';
COMMENT ON COLUMN users.current_medications_enc IS 'AES-256-GCM encrypted, base64url-encoded current medications';
