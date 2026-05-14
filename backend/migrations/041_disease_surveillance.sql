-- Migration 041: Disease Surveillance & Early Warning
-- Materalised condition-frequency aggregates and anomaly detection results
-- that power the LifeGate Public Health Analytics Dashboard.
--
-- All data stored here is anonymised at state-level.  No patient identifiers
-- are ever written to these tables — only aggregate counts derived from the
-- diagnoses + users join at compute time.

-- ── Condition frequency aggregates ──────────────────────────────────────────
-- One row per (condition, state, country, week).
-- Recomputed hourly by the surveillance background worker.
CREATE TABLE IF NOT EXISTS surveillance_condition_counts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    condition_name  VARCHAR(255) NOT NULL,
    state           VARCHAR(100) NOT NULL DEFAULT 'Unknown',
    country         VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
    period_start    DATE         NOT NULL,   -- Monday of the ISO week
    period_end      DATE         NOT NULL,   -- Sunday of the ISO week
    period_type     VARCHAR(20)  NOT NULL DEFAULT 'weekly',
    case_count      INTEGER      NOT NULL DEFAULT 0,
    escalated_count INTEGER      NOT NULL DEFAULT 0,
    avg_confidence  NUMERIC(5,2),
    computed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (condition_name, state, country, period_start, period_type)
);

-- ── Anomaly detection results ────────────────────────────────────────────────
-- A row is inserted whenever a condition's weekly count exceeds
-- rolling_avg + 2 * rolling_stddev (minimum 3 cases, 8-week window).
CREATE TABLE IF NOT EXISTS surveillance_anomalies (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    condition_name  VARCHAR(255) NOT NULL,
    state           VARCHAR(100) NOT NULL DEFAULT 'Unknown',
    country         VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
    period_start    DATE         NOT NULL,
    current_count   INTEGER      NOT NULL,
    rolling_avg     NUMERIC(8,2) NOT NULL,
    rolling_stddev  NUMERIC(8,2) NOT NULL,
    z_score         NUMERIC(6,2) NOT NULL,
    -- 'mild' = 2–3σ | 'moderate' = 3–4σ | 'severe' = >4σ
    severity        VARCHAR(20)  NOT NULL DEFAULT 'mild',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    notified        BOOLEAN      NOT NULL DEFAULT FALSE,
    detected_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at     TIMESTAMP WITH TIME ZONE,
    UNIQUE (condition_name, state, period_start)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_surv_counts_condition
    ON surveillance_condition_counts (condition_name);
CREATE INDEX IF NOT EXISTS idx_surv_counts_state
    ON surveillance_condition_counts (state);
CREATE INDEX IF NOT EXISTS idx_surv_counts_period
    ON surveillance_condition_counts (period_start DESC);
CREATE INDEX IF NOT EXISTS idx_surv_counts_lookup
    ON surveillance_condition_counts (condition_name, state, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_surv_anomalies_active
    ON surveillance_anomalies (is_active, detected_at DESC)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_surv_anomalies_condition
    ON surveillance_anomalies (condition_name, detected_at DESC);
