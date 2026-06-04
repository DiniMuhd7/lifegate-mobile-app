-- Track the physician's final decision on a completed case:
--   physician_decision: 'Approved' | 'Rejected'  (NULL until the case is Completed)
--   rejection_reason  : free-text explanation required when decision = 'Rejected'

ALTER TABLE diagnoses
    ADD COLUMN IF NOT EXISTS physician_decision VARCHAR(50),
    ADD COLUMN IF NOT EXISTS rejection_reason   TEXT;
