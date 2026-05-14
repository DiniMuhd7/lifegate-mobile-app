-- 042: Public Analytics Dashboard — Access Request Portal
-- Stores institutional access applications submitted through public.dshub.com.ng.

CREATE TABLE IF NOT EXISTS public_access_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL,
    full_name       TEXT        NOT NULL,
    institution     TEXT        NOT NULL,
    job_title       TEXT        NOT NULL,
    role            TEXT        NOT NULL CHECK (role IN ('government','ngo','research','hospital','other')),
    use_case        TEXT        NOT NULL,
    tier            TEXT        NOT NULL CHECK (tier IN ('free','view','export','api')),
    currency        TEXT        NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN','USD')),
    -- amount stored in the native unit: full Naira for NGN, full US dollars for USD.
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Flutterwave transaction ref and ID (NULL for free-tier requests).
    flw_tx_ref      TEXT        UNIQUE,
    flw_tx_id       TEXT,
    payment_status  TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','paid','free','failed')),
    access_status   TEXT        NOT NULL DEFAULT 'pending_review'
                        CHECK (access_status IN ('pending_review','approved','rejected')),
    -- api_key populated by admin when request is approved for the 'api' tier.
    api_key         TEXT,
    approved_at     TIMESTAMPTZ,
    admin_notes     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_par_email       ON public_access_requests(email);
CREATE INDEX IF NOT EXISTS idx_par_access_st   ON public_access_requests(access_status);
CREATE INDEX IF NOT EXISTS idx_par_payment_st  ON public_access_requests(payment_status);
CREATE INDEX IF NOT EXISTS idx_par_created     ON public_access_requests(created_at DESC);
