-- 031_explore_video_language.sql
-- Store a language tag on explore videos so the catalogue can be selected
-- using each patient's saved language preference while preserving rewards.

ALTER TABLE explore_videos
    ADD COLUMN IF NOT EXISTS language VARCHAR(16) NOT NULL DEFAULT 'en';

UPDATE explore_videos
SET language = 'en'
WHERE COALESCE(language, '') = '';

CREATE INDEX IF NOT EXISTS idx_explore_videos_active_language_category
    ON explore_videos(language, category, sort_order)
    WHERE is_active = TRUE;