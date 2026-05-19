-- 044: premium subscription status on the credits wallet
-- Adds is_premium, premium_expires_at, and premium_billing_cycle so that
-- Premium subscribers get unlimited clinical diagnosis sessions (bypassing
-- per-session credit deduction) for the duration of their active subscription.
ALTER TABLE credits
    ADD COLUMN IF NOT EXISTS is_premium            BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS premium_expires_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS premium_billing_cycle VARCHAR(20);

-- Back-fill premium status for users who have already paid for a premium plan.
-- Uses the most-recent successful premium transaction per user to seed the
-- expiry timestamp (monthly = +1 month, annual = +1 year from purchase date).
UPDATE credits c
SET
    is_premium            = TRUE,
    premium_billing_cycle = CASE
        WHEN pt.bundle_id = 'premium_annual' THEN 'annual'
        ELSE 'monthly'
    END,
    premium_expires_at    = CASE
        WHEN pt.bundle_id = 'premium_annual' THEN pt.created_at + INTERVAL '1 year'
        ELSE pt.created_at + INTERVAL '1 month'
    END
FROM (
    SELECT DISTINCT ON (user_id)
        user_id, bundle_id, created_at
    FROM payment_transactions
    WHERE bundle_id IN ('premium_monthly', 'premium_annual')
      AND status = 'success'
    ORDER BY user_id, created_at DESC
) pt
WHERE c.user_id = pt.user_id;
