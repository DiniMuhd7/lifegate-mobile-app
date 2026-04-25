-- Migration 028: Lifecoins redemption admin approval workflow
-- Adds approval/rejection state to lifecoins_transactions and an
-- admin_notes column for rejection reasons.

-- Add new statuses and admin tracking columns to lifecoins_transactions.
-- transfer_status is updated from its existing CHECK constraint.
ALTER TABLE lifecoins_transactions
    DROP CONSTRAINT IF EXISTS lifecoins_transactions_transfer_status_check;

ALTER TABLE lifecoins_transactions
    ADD CONSTRAINT lifecoins_transactions_transfer_status_check
    CHECK (transfer_status IN (
        'pending_approval',  -- waiting for admin to approve
        'rejected',          -- admin rejected
        'pending',           -- approved, awaiting FLW confirmation
        'processing',        -- FLW transfer call in-flight
        'success',           -- FLW confirmed disbursed
        'failed'             -- FLW transfer failed (coins refunded)
    ));

-- Admin who approved or rejected the request.
ALTER TABLE lifecoins_transactions
    ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_note   TEXT;

-- Index for the admin approval queue view.
CREATE INDEX IF NOT EXISTS idx_lifecoins_pending_approval
    ON lifecoins_transactions(transfer_status, created_at DESC)
    WHERE transfer_status = 'pending_approval';
