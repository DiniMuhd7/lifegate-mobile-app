-- 058_explore_interactions.sql
-- Per-user video engagement signals for the personalization algorithm.
-- Tracks how long each user watched each video and whether they completed it.
-- Used to build interest profiles and improve per-user video ranking.

CREATE TABLE IF NOT EXISTS explore_video_interactions (
    id            BIGSERIAL   PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id      TEXT        NOT NULL,  -- no FK — videos may be purged independently
    category      TEXT        NOT NULL DEFAULT '',
    watch_seconds INTEGER     NOT NULL DEFAULT 0,
    completed     BOOLEAN     NOT NULL DEFAULT FALSE,
    is_short      BOOLEAN     NOT NULL DEFAULT FALSE,
    interacted_on DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One interaction record per user per video per day
    UNIQUE(user_id, video_id, interacted_on)
);

CREATE INDEX IF NOT EXISTS idx_explore_interactions_user_date
    ON explore_video_interactions(user_id, interacted_on DESC);

CREATE INDEX IF NOT EXISTS idx_explore_interactions_category
    ON explore_video_interactions(user_id, category, interacted_on DESC);
