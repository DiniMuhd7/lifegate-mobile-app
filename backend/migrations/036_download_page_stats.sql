CREATE TABLE IF NOT EXISTS download_page_stats (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    page_views BIGINT NOT NULL DEFAULT 0,
    android_clicks BIGINT NOT NULL DEFAULT 0,
    ios_clicks BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO download_page_stats (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
