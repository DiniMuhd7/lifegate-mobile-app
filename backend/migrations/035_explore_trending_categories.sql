-- Dynamic trending health categories for the Explore screen.
-- Admins can INSERT/UPDATE rows (or flip is_active) to rotate trending categories
-- without deploying new code. The backend refresher reads active rows at run-time
-- and fetches YouTube videos for them alongside the permanent category set.

CREATE TABLE IF NOT EXISTS explore_trending_categories (
    name        TEXT        NOT NULL PRIMARY KEY,
    query       TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#0AADA2',
    icon        TEXT        NOT NULL DEFAULT 'trending-up-outline',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the current trending categories (Gut Health + Longevity).
-- These replace the previously hardcoded values in the mobile store.
INSERT INTO explore_trending_categories (name, query, color, icon) VALUES
    ('Gut Health', 'gut health microbiome probiotics digestive health science doctor', '#22c55e', 'leaf-outline'),
    ('Longevity',  'longevity healthy aging lifespan healthspan biology science',      '#a855f7', 'infinite-outline')
ON CONFLICT (name) DO NOTHING;
