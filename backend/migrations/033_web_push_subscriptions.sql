-- Web Push subscriptions: stores browser PushSubscription objects per user.
-- One row per browser/device endpoint. Endpoint is unique so re-subscribing
-- from the same browser just updates the keys rather than creating duplicates.

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    endpoint    TEXT        NOT NULL UNIQUE,
    p256dh      TEXT        NOT NULL,
    auth_key    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON web_push_subscriptions(user_id);
