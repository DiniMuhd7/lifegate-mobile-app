UPDATE download_page_stats
SET
    page_views = 527000,
    android_clicks = 255000,
    ios_clicks = 272000,
    updated_at = NOW()
WHERE id = 1;

INSERT INTO download_page_stats (id, page_views, android_clicks, ios_clicks, updated_at)
VALUES (1, 527000, 255000, 272000, NOW())
ON CONFLICT (id) DO UPDATE
SET
    page_views = EXCLUDED.page_views,
    android_clicks = EXCLUDED.android_clicks,
    ios_clicks = EXCLUDED.ios_clicks,
    updated_at = EXCLUDED.updated_at;
