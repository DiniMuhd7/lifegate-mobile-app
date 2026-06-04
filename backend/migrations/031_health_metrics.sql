-- 031: continuous background health metrics
-- Stores periodic step / activity snapshots uploaded from the patient's device.
-- One row per sync event (roughly every 15 minutes while the app is active or
-- via a background-fetch task when the app is in the background).

CREATE TABLE IF NOT EXISTS health_metrics (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    steps_today      INT         NOT NULL DEFAULT 0,
    active_minutes   INT         NOT NULL DEFAULT 0,
    distance_meters  NUMERIC(10, 2) NOT NULL DEFAULT 0,
    calories         NUMERIC(8,  2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_user_date
    ON health_metrics (user_id, recorded_at DESC);
