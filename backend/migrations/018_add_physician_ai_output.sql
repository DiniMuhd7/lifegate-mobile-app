-- 018: Add physician_ai_output column to store physician-edited AI output
-- The column is a JSONB superset of ai_response, allowing the physician to
-- override individual fields (prescription, investigations, conditions).
-- The patient-facing API prefers physician_ai_output when it is non-null,
-- falling back to ai_response for unreviewed cases.

ALTER TABLE diagnoses
    ADD COLUMN IF NOT EXISTS physician_ai_output JSONB;
