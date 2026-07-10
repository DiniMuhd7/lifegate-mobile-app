-- 059: Add a flexible test_results column to users for admin CSV bulk-import.
-- Stores arbitrary lab/test result key-value pairs (e.g. hemoglobin, glucose,
-- cholesterol, hepatitis_b, hiv_status) that don't warrant a dedicated column.
-- Existing values are merged (not replaced) on each CSV import so partial
-- updates from different test batches accumulate over time.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS test_results JSONB NOT NULL DEFAULT '{}'::jsonb;
