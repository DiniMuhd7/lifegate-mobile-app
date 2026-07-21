-- Migration 065: Prevent a campaign from sending twice to the same email address.
-- Earlier delivery tracking was unique by user_id only; if a patient account is
-- recreated or duplicated with the same email, the campaign must still skip it.

UPDATE patient_email_broadcast_deliveries
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_email_broadcast_deliveries_campaign_email
    ON patient_email_broadcast_deliveries (campaign_key, email);
