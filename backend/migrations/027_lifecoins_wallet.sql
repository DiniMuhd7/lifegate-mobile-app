-- Migration 027: Lifecoins wallet & transaction ledger
-- Lifecoins are earned through check-ins, surveys, offers, and explore videos.
-- They can be redeemed as a health-insurance waiver: a Naira disbursement is
-- sent to a pharmacy/health-firm bank account to cover prescription costs.

-- Naira value per Lifecoin (10 NGN per coin).
-- Kept as a config row so it can be updated without a new migration.
CREATE TABLE IF NOT EXISTS lifecoins_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO lifecoins_config (key, value)
VALUES ('naira_per_coin', '10')
ON CONFLICT (key) DO NOTHING;

-- Per-user balance & lifetime stats.
CREATE TABLE IF NOT EXISTS lifecoins_wallet (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned  INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full transaction ledger: both earning events and redemption events.
CREATE TABLE IF NOT EXISTS lifecoins_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'earn' = coins added; 'redeem' = coins spent
    type        TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
    -- Source of earnings: checkin | survey | offer | explore | referral
    source      TEXT NOT NULL,
    coins       INTEGER NOT NULL CHECK (coins > 0),
    naira_amount INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    -- For redeem transactions only: disbursement details
    health_firm_name    TEXT,
    account_number      TEXT,
    bank_code           TEXT,
    bank_name           TEXT,
    -- Flutterwave transfer reference (populated on successful disbursement)
    flw_transfer_ref    TEXT,
    transfer_status     TEXT NOT NULL DEFAULT 'pending'
                            CHECK (transfer_status IN ('pending', 'processing', 'success', 'failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecoins_transactions_user_id
    ON lifecoins_transactions(user_id, created_at DESC);

-- Per-user check-in answer log (for audit and health analytics).
CREATE TABLE IF NOT EXISTS checkin_answers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id     INTEGER NOT NULL,
    slot_date   DATE NOT NULL,
    answers     JSONB NOT NULL DEFAULT '[]',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_answers_user_date
    ON checkin_answers(user_id, slot_date DESC);
