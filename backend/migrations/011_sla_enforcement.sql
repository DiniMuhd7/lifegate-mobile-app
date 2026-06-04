-- Migration 011: SLA Enforcement
-- Adds the reassignment log table used by the background SLA enforcement service.
-- Each row records a detected SLA breach (case pending > 4 h) together with
-- the auto-reassignment action taken and the NATS publish status.

CREATE TABLE IF NOT EXISTS sla_reassignment_log (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id                 UUID        NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
    case_title              TEXT        NOT NULL DEFAULT '',
    urgency                 TEXT        NOT NULL DEFAULT 'LOW',
    wait_seconds            BIGINT      NOT NULL DEFAULT 0,

    -- Original physician (NULL for Pending cases that had no physician yet)
    original_physician_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    original_physician_name TEXT        NOT NULL DEFAULT '',

    -- Newly assigned physician (NULL when no available physician was found)
    new_physician_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
    new_physician_name      TEXT        NOT NULL DEFAULT '',

    -- Whether the NATS admin.sla.breach.alert event was successfully published
    nats_published          BOOLEAN     NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_reassignment_log_created
    ON sla_reassignment_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sla_reassignment_log_case
    ON sla_reassignment_log(case_id);

CREATE INDEX IF NOT EXISTS idx_sla_reassignment_log_new_physician
    ON sla_reassignment_log(new_physician_id)
    WHERE new_physician_id IS NOT NULL;
