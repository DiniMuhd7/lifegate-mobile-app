-- Migration 008: Physician earnings and payout tracking
-- Payouts first so physician_earnings can reference it via payout_id

CREATE TABLE IF NOT EXISTS physician_payouts (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    physician_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start        DATE        NOT NULL,
    period_end          DATE        NOT NULL,
    case_count          INTEGER     NOT NULL DEFAULT 0,
    total_amount_naira  INTEGER     NOT NULL DEFAULT 0,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending | processing | paid
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (physician_id, period_start)
);

CREATE TABLE IF NOT EXISTS physician_earnings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    physician_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diagnosis_id    UUID        NOT NULL UNIQUE REFERENCES diagnoses(id) ON DELETE CASCADE,
    patient_name    TEXT        NOT NULL DEFAULT '',
    condition       TEXT        NOT NULL DEFAULT '',
    urgency         VARCHAR(50) NOT NULL DEFAULT 'LOW',
    amount_naira    INTEGER     NOT NULL DEFAULT 500,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending | paid
    payout_id       UUID        REFERENCES physician_payouts(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_physician_earnings_physician
    ON physician_earnings(physician_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_physician_earnings_status
    ON physician_earnings(physician_id, status);

CREATE INDEX IF NOT EXISTS idx_physician_payouts_physician
    ON physician_payouts(physician_id, period_start DESC);
