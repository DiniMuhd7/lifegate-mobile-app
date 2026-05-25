-- 052: Daily check-in streaks and scheduled-notification state
--
-- user_streaks          — server-authoritative streak counter per user
-- bundle_promos         — optional time-limited promotional pricing per bundle

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id            UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak     INT         NOT NULL DEFAULT 0,
  longest_streak     INT         NOT NULL DEFAULT 0,
  last_checkin_date  DATE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_streaks_last_checkin ON user_streaks (last_checkin_date);

-- Promotional expiry on bundles (optional per-bundle, null = no expiry)
ALTER TABLE IF EXISTS credits
  ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMPTZ;

-- bundle_promos: row per bundle that has a time-limited offer
CREATE TABLE IF NOT EXISTS bundle_promos (
  bundle_id          TEXT        PRIMARY KEY,  -- matches bundleBase id ("starter", "standard" …)
  promo_label        TEXT        NOT NULL,     -- e.g. "Flash sale — 20% off"
  original_ngn       INT         NOT NULL,
  promo_ngn          INT         NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
