-- Add escalated flag to diagnoses table.
-- Set when the backend auto-promotes a General Health session to Clinical Diagnosis
-- due to HIGH or CRITICAL urgency being detected in an AI response.
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE;

-- Index to let physicians quickly filter escalated cases requiring priority review.
CREATE INDEX IF NOT EXISTS idx_diagnoses_escalated ON diagnoses(escalated) WHERE escalated = TRUE;
