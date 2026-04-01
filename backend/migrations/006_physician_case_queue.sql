-- 006_physician_case_queue.sql
-- Partial indexes that support the physician case-queue API without touching data.
--
-- Status lifecycle: Pending  → Active (locked to reviewing physician)
--                           → Completed (after physician review)
--
-- Pending: physician_id IS NULL, status = 'Pending'
-- Active:  physician_id = <physician>, status = 'Active'
-- Completed: physician_id = <physician>, status = 'Completed'

-- FIFO queue for unassigned pending cases.
CREATE INDEX IF NOT EXISTS idx_diagnoses_pending_queue
    ON diagnoses (created_at ASC)
    WHERE status = 'Pending' AND physician_id IS NULL;

-- Active & completed cases per physician (for dashboard tabs).
CREATE INDEX IF NOT EXISTS idx_diagnoses_active_physician
    ON diagnoses (physician_id, updated_at DESC)
    WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_diagnoses_completed_physician
    ON diagnoses (physician_id, updated_at DESC)
    WHERE status = 'Completed';
