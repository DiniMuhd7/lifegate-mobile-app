-- Reset download page stats to the correct baseline values.
UPDATE download_page_stats
SET
    page_views     = 527,
    android_clicks = 225,
    ios_clicks     = 250,
    updated_at     = NOW()
WHERE id = 1;

INSERT INTO download_page_stats (id, page_views, android_clicks, ios_clicks, updated_at)
VALUES (1, 527, 225, 250, NOW())
ON CONFLICT (id) DO UPDATE
SET
    page_views     = EXCLUDED.page_views,
    android_clicks = EXCLUDED.android_clicks,
    ios_clicks     = EXCLUDED.ios_clicks,
    updated_at     = EXCLUDED.updated_at;
