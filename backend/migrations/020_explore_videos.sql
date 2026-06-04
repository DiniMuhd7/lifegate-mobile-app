-- 020_explore_videos.sql
-- Catalogue of health education videos shown in the patient Explore tab.
-- Rewards (Lifecoins) earned by watching are tracked per-user per day in
-- explore_video_rewards.

CREATE TABLE IF NOT EXISTS explore_videos (
    id               TEXT        PRIMARY KEY,
    title            TEXT        NOT NULL,
    description      TEXT        NOT NULL,
    category         TEXT        NOT NULL,
    duration_seconds INTEGER     NOT NULL DEFAULT 0,
    coins            INTEGER     NOT NULL DEFAULT 3,
    thumbnail_color  TEXT        NOT NULL DEFAULT '#059669',
    thumbnail_icon   TEXT        NOT NULL DEFAULT 'play-circle-outline',
    instructor       TEXT        NOT NULL DEFAULT '',
    youtube_id       TEXT        NOT NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order       INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS explore_video_rewards (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id     TEXT        NOT NULL REFERENCES explore_videos(id) ON DELETE CASCADE,
    rewarded_on  DATE        NOT NULL DEFAULT CURRENT_DATE,
    coins_earned INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, video_id, rewarded_on)
);

CREATE INDEX IF NOT EXISTS idx_explore_video_rewards_user_date
    ON explore_video_rewards(user_id, rewarded_on);

