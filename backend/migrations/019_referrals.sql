-- Migration 019: Referral system
-- Each patient gets a unique referral code.
-- When a referred patient registers, the referrer earns 5 bonus credits.

-- Add referral_code column to users (unique, generated on registration)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE;

-- Track referral relationships and bonus status
CREATE TABLE IF NOT EXISTS referrals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
    bonus_tx_ref  VARCHAR(100) UNIQUE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (referred_id)  -- each new user can only be referred once
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
