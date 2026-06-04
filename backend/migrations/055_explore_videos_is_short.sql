-- 055_explore_videos_is_short.sql
-- Adds an is_short flag to the explore_videos catalogue so YouTube Shorts
-- (≤60 s) can be stored and served alongside medium-length education videos.

ALTER TABLE explore_videos
    ADD COLUMN IF NOT EXISTS is_short BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_explore_videos_is_short
    ON explore_videos(is_short, is_active);
