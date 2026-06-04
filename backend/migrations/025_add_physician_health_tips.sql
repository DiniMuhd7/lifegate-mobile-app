-- Migration 025: Add physician_health_tips column to diagnoses
-- Allows physicians to record personalised health tips for patients.
-- The column is exposed in the patient-facing diagnosis response so the
-- patient's greeting card can display physician-curated advice.

ALTER TABLE diagnoses
  ADD COLUMN IF NOT EXISTS physician_health_tips TEXT;
