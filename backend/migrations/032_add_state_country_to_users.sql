-- Add state and country fields to the users table.
-- Both are optional demographic fields used by the EDIS triage engine to
-- surface region-specific endemic disease patterns and local referral guidance.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS state   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100);
