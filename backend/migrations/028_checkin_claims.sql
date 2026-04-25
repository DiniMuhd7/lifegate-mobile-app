-- Migration 028: Check-in claims ledger
-- Tracks per-user per-slot daily claims so the backend can award Lifecoins
-- idempotently and persist the balance across app restarts / wallet syncs.

CREATE TABLE IF NOT EXISTS checkin_claims (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id    INTEGER     NOT NULL,
    claim_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    coins      INTEGER     NOT NULL DEFAULT 1 CHECK (coins > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, slot_id, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_checkin_claims_user_date
    ON checkin_claims (user_id, claim_date DESC);
