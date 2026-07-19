-- Migration 064: Disable the SPAN admin login and add idempotent bulk email batching.

DELETE FROM users
WHERE role = 'admin'
  AND LOWER(TRIM(email)) = 'span@dshub.com.ng';

CREATE TABLE IF NOT EXISTS patient_email_broadcast_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    resend_message_id TEXT,
    error TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_email_broadcast_deliveries_campaign
    ON patient_email_broadcast_deliveries (campaign_key, status, sent_at DESC);
