-- 034_physician_payout_requests.sql
-- Extends physician_payouts to support the physician-initiated payout request
-- approval workflow and changes the payout cycle to monthly.

-- Columns added to support request/review lifecycle
ALTER TABLE physician_payouts
    ADD COLUMN IF NOT EXISTS requested_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Index for admin queue: pending requests ordered by request time
CREATE INDEX IF NOT EXISTS idx_physician_payouts_requested
    ON physician_payouts(status, requested_at DESC)
    WHERE requested_at IS NOT NULL;
