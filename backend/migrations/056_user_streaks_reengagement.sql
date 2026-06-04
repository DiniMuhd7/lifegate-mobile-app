-- 056_user_streaks_reengagement.sql
-- Adds last_reengagement_sent to user_streaks so the re-engagement scheduler
-- can enforce a 7-day cooldown per user and avoid over-messaging.

ALTER TABLE user_streaks
    ADD COLUMN IF NOT EXISTS last_reengagement_sent DATE;

CREATE INDEX IF NOT EXISTS idx_user_streaks_reengagement
    ON user_streaks (last_reengagement_sent);
