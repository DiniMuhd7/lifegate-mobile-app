-- Migration 015: Structured HPI (History of Present Illness) on diagnoses
-- Stores the OLDCARTS-aligned symptom profile that EDIS collects before
-- committing to a differential diagnosis.  The column mirrors the 'hpi'
-- sub-object in the ai_response JSONB but is indexed independently so that
-- physicians can filter/sort cases by onset, duration, or severity without
-- having to descend into the JSONB blob.

ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS hpi JSONB;

-- Partial index: only cases that have a captured HPI need to be searchable
-- by the physician review dashboard.
CREATE INDEX IF NOT EXISTS idx_diagnoses_hpi
    ON diagnoses USING gin(hpi)
    WHERE hpi IS NOT NULL;
