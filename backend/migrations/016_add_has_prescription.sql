-- Migration 016: Add has_prescription flag to diagnoses
-- Any case where the AI included a prescription is flagged here so the
-- physician review queue can gate prescription release until approved.
-- The column is also used by the patient-facing API to show a
-- "Pending physician approval" state until the case reaches
-- Completed + PhysicianDecision = 'Approved'.

ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS has_prescription BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing rows: mark any case whose ai_response contains a
-- non-null prescription object.
UPDATE diagnoses
SET has_prescription = TRUE
WHERE has_prescription = FALSE
  AND ai_response->'prescription' IS NOT NULL
  AND ai_response->>'prescription' <> 'null';

CREATE INDEX IF NOT EXISTS idx_diagnoses_has_prescription
    ON diagnoses (has_prescription)
    WHERE has_prescription = TRUE;
