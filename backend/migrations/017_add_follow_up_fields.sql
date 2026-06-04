-- Migration 017: Follow-up plan fields on diagnoses
-- Stores structured follow-up information produced by EDIS alongside each
-- diagnosis so that the notification scheduler can send a timely "Did your
-- symptoms improve?" prompt and escalate unresponsive or worsening cases.

ALTER TABLE diagnoses
  ADD COLUMN IF NOT EXISTS follow_up_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_notified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_checked        BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: the follow-up scheduler only needs to scan rows where a
-- follow-up is due and the outcome has not yet been checked.
CREATE INDEX IF NOT EXISTS idx_diagnoses_follow_up_pending
    ON diagnoses (follow_up_date)
    WHERE follow_up_date IS NOT NULL
      AND outcome_checked = FALSE;
