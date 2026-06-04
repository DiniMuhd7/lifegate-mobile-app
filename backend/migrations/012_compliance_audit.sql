-- Migration 012: Compliance & Audit
-- Comprehensive audit event log, NDPA compliance snapshots, and alert threshold config.

-- ── Comprehensive audit event log ────────────────────────────────────────────
-- Captures every significant lifecycle event across cases, payments, admin
-- actions, escalations, and authentication.
CREATE TABLE IF NOT EXISTS audit_events (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type   VARCHAR(80) NOT NULL,  -- e.g. "case.status_change", "payment.success"
    actor_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    actor_role   VARCHAR(20) NOT NULL DEFAULT '',  -- "user" | "professional" | "admin" | "system"
    resource     VARCHAR(50) NOT NULL DEFAULT '',  -- "diagnosis" | "payment" | "user" | "physician" ...
    resource_id  UUID,
    old_value    JSONB       NOT NULL DEFAULT '{}',
    new_value    JSONB       NOT NULL DEFAULT '{}',
    ip_address   VARCHAR(45) NOT NULL DEFAULT '',
    metadata     JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type
    ON audit_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
    ON audit_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource
    ON audit_events(resource, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
    ON audit_events(created_at DESC);

-- ── NDPA compliance snapshots ─────────────────────────────────────────────────
-- Written periodically (or on-demand) to prove per-NDPA-2023 obligation status.
CREATE TABLE IF NOT EXISTS ndpa_compliance_snapshots (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
    total_data_subjects   INT         NOT NULL DEFAULT 0,
    consent_captured_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    data_minimisation_ok  BOOLEAN     NOT NULL DEFAULT FALSE,
    retention_policy_ok   BOOLEAN     NOT NULL DEFAULT FALSE,
    breach_incidents_30d  INT         NOT NULL DEFAULT 0,
    pending_dsar          INT         NOT NULL DEFAULT 0,  -- Data Subject Access Requests
    notes                 TEXT        NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ndpa_snapshots_date
    ON ndpa_compliance_snapshots(snapshot_date DESC);

-- ── Alert threshold configuration ─────────────────────────────────────────────
-- One row per named threshold; admins edit these via the Alert Settings screen.
CREATE TABLE IF NOT EXISTS alert_thresholds (
    key           VARCHAR(80) PRIMARY KEY,
    label         VARCHAR(120) NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    value         NUMERIC      NOT NULL,
    unit          VARCHAR(20)  NOT NULL DEFAULT '',  -- "hours" | "count" | "pct"
    category      VARCHAR(40)  NOT NULL DEFAULT 'general',  -- "sla" | "payment" | "security" | "general"
    enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by    UUID         REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default thresholds (idempotent).
INSERT INTO alert_thresholds (key, label, description, value, unit, category) VALUES
  ('sla.pending_window_hours',     'SLA Pending Window',           'Hours before a pending case triggers SLA breach',                       4,   'hours',  'sla'),
  ('sla.active_window_hours',      'SLA Active Window',            'Hours after physician assignment before case is considered breached',    4,   'hours',  'sla'),
  ('sla.breach_flag_threshold',    'SLA Breach Flag Count',        'Number of SLA breaches in 7 days before physician is flagged',          3,   'count',  'sla'),
  ('payment.max_daily_amount',     'Max Daily Payment Amount',     'Maximum naira amount a user can pay per day (fraud guard)',              50000, 'NGN',  'payment'),
  ('payment.failed_tx_alert',      'Failed Transaction Alert',     'Number of failed transactions in 24 h that triggers an admin alert',    5,   'count',  'payment'),
  ('security.login_fail_lockout',  'Login Failure Lockout',        'Consecutive failed logins before account is temporarily locked',        5,   'count',  'security'),
  ('security.session_timeout_min', 'Session Timeout',              'Idle minutes before an authenticated session expires',                  60,  'minutes','security'),
  ('ndpa.dsar_response_days',      'DSAR Response Window',         'Maximum days to respond to a Data Subject Access Request (NDPA 2023)',  30,  'days',   'ndpa'),
  ('ndpa.data_retention_days',     'Data Retention Period',        'Days patient data is retained before anonymisation review',             2555,'days',   'ndpa'),
  ('escalation.high_urgency_pct',  'High-Urgency Escalation Alert','% of cases marked HIGH/CRITICAL that triggers an escalation alert',    20,  'pct',    'general')
ON CONFLICT (key) DO NOTHING;
