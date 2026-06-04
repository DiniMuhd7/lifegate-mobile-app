-- 043: Institutional access — partial index for fast API key lookups.
-- The middleware does a point-lookup on api_key for every institutional request,
-- so an index on the non-null, approved rows is critical.

CREATE INDEX IF NOT EXISTS idx_par_api_key
    ON public_access_requests(api_key)
    WHERE api_key IS NOT NULL AND access_status = 'approved';
