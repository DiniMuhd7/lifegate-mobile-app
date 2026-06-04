-- 040: Medication release request flow.
-- Patients may request early release of their AI-recommended prescription
-- when physician review is delayed. Admins can approve all pending requests
-- in a single bulk action. Once approved the prescription card becomes
-- visible to the patient on the diagnosis report screen.

ALTER TABLE diagnoses
    ADD COLUMN IF NOT EXISTS medication_release_requested    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS medication_release_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS medication_release_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS medication_release_approved_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS medication_release_approved_by  UUID REFERENCES users(id);

-- Index for the admin queue — only rows that have been requested but not yet approved.
CREATE INDEX IF NOT EXISTS idx_diagnoses_medication_release
    ON diagnoses (medication_release_requested, medication_release_approved)
    WHERE medication_release_requested = TRUE;
