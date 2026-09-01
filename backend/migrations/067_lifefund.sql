-- 067: LifeFund — healthcare financing/loan facility.
--
-- LifeFund is a lending product, not free money. It tracks a per-patient
-- account (status + dynamic credit limit + running balance), individual
-- financing requests (the loan applications, each with its own principal,
-- interest, fees, and full lifecycle), and the repayment schedule/ledger
-- for each disbursed request.
--
-- Admin actions on requests are logged through the existing `audit_events`
-- table (see internal/audit + internal/admin) rather than a bespoke log —
-- one audit trail for the whole platform.
--
-- Configurable rules (limits, interest, tiers, etc.) live in the existing
-- `alert_thresholds` table under category = 'lifefund' so they can be
-- tuned from the admin Settings screen without a code change or hard-coded
-- constants anywhere in the eligibility engine.

-- ── Per-patient LifeFund account ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifefund_accounts (
    user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status                    VARCHAR(20) NOT NULL DEFAULT 'INELIGIBLE'
        CHECK (status IN ('ELIGIBLE','PENDING_REVIEW','LIMITED','RESTRICTED','SUSPENDED','DEFAULTED','INELIGIBLE')),
    credit_limit              NUMERIC(14,2) NOT NULL DEFAULT 0,
    outstanding_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
    successful_repayments     INT NOT NULL DEFAULT 0,
    defaults_count            INT NOT NULL DEFAULT 0,
    risk_score                NUMERIC(5,2) NOT NULL DEFAULT 50, -- 0 (safest) – 100 (riskiest)
    last_eligibility_reason   TEXT NOT NULL DEFAULT '',
    admin_override_status     VARCHAR(20)
        CHECK (admin_override_status IS NULL OR admin_override_status IN
            ('ELIGIBLE','PENDING_REVIEW','LIMITED','RESTRICTED','SUSPENDED','DEFAULTED','INELIGIBLE')),
    admin_override_reason     TEXT NOT NULL DEFAULT '',
    admin_override_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_override_at         TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Financing requests (the loan applications) ──────────────────────────────
CREATE TABLE IF NOT EXISTS lifefund_requests (
    id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    expense_category           VARCHAR(40) NOT NULL
        CHECK (expense_category IN ('HOSPITAL_BILL','PHARMACY','DIAGNOSTIC_TEST','CONSULTATION','MEDICAL_PROCEDURE','HEALTHCARE_EQUIPMENT','OTHER')),
    purpose_description         TEXT NOT NULL DEFAULT '',

    healthcare_provider_name    VARCHAR(160) NOT NULL DEFAULT '',
    healthcare_provider_account VARCHAR(80)  NOT NULL DEFAULT '', -- hospital/pharmacy account no. for disbursement
    bill_reference               VARCHAR(120) NOT NULL DEFAULT '',
    supporting_documents        JSONB NOT NULL DEFAULT '[]',       -- [{url,name,uploadedAt}]

    requested_amount             NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
    approved_amount               NUMERIC(14,2),
    financing_provider            VARCHAR(120) NOT NULL DEFAULT 'LifeGate LifeFund',

    interest_rate_pct             NUMERIC(6,3) NOT NULL DEFAULT 0,
    fee_amount                     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_repayable                 NUMERIC(14,2), -- principal + interest + fees, set on approval
    outstanding_balance             NUMERIC(14,2) NOT NULL DEFAULT 0,

    repayment_frequency_days         INT NOT NULL DEFAULT 14,
    installments_count                INT NOT NULL DEFAULT 1,
    first_repayment_date              DATE,
    final_repayment_date              DATE,

    risk_score                        NUMERIC(5,2) NOT NULL DEFAULT 50,
    fraud_flags                       JSONB NOT NULL DEFAULT '[]', -- [{code,detail,flaggedAt}]
    eligibility_snapshot              JSONB NOT NULL DEFAULT '{}', -- eligibility engine inputs/outputs at submission time

    status                            VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (status IN (
            'PENDING_REVIEW','MORE_INFO_REQUIRED','APPROVED','REJECTED',
            'AWAITING_ACCEPTANCE','ACCEPTED','DISBURSED','ACTIVE',
            'COMPLETED','OVERDUE','DEFAULTED','CANCELLED','ESCALATED','RESTRUCTURED')),

    admin_notes                        TEXT NOT NULL DEFAULT '',
    reviewed_by                        UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at                        TIMESTAMPTZ,

    agreement_terms                    JSONB NOT NULL DEFAULT '{}', -- frozen copy of the agreement shown to the patient
    agreement_accepted_at              TIMESTAMPTZ,
    disbursed_at                       TIMESTAMPTZ,
    completed_at                       TIMESTAMPTZ,
    defaulted_at                       TIMESTAMPTZ,

    created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifefund_requests_user ON lifefund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_lifefund_requests_status ON lifefund_requests(status);
CREATE INDEX IF NOT EXISTS idx_lifefund_requests_created ON lifefund_requests(created_at DESC);

-- ── Repayment schedule (installment plan per request) ───────────────────────
CREATE TABLE IF NOT EXISTS lifefund_repayment_schedule (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID NOT NULL REFERENCES lifefund_requests(id) ON DELETE CASCADE,
    installment_no  INT NOT NULL,
    due_date        DATE NOT NULL,
    amount_due      NUMERIC(14,2) NOT NULL,
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PAID','PARTIAL','OVERDUE')),
    paid_at         TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_lifefund_schedule_request ON lifefund_repayment_schedule(request_id);
CREATE INDEX IF NOT EXISTS idx_lifefund_schedule_due ON lifefund_repayment_schedule(due_date) WHERE status IN ('PENDING','OVERDUE','PARTIAL');

-- ── Repayment ledger (actual payment events) ────────────────────────────────
CREATE TABLE IF NOT EXISTS lifefund_repayments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id    UUID NOT NULL REFERENCES lifefund_requests(id) ON DELETE CASCADE,
    schedule_id   UUID REFERENCES lifefund_repayment_schedule(id) ON DELETE SET NULL,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method        VARCHAR(40) NOT NULL DEFAULT 'flutterwave',
    provider_ref  VARCHAR(160) NOT NULL DEFAULT '',
    status        VARCHAR(16) NOT NULL DEFAULT 'SUCCESSFUL'
        CHECK (status IN ('SUCCESSFUL','FAILED','PENDING')),
    paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifefund_repayments_request ON lifefund_repayments(request_id);
CREATE INDEX IF NOT EXISTS idx_lifefund_repayments_user ON lifefund_repayments(user_id);

-- ── Configurable rules (never hard-code limits/rates) ───────────────────────
-- Reuses the existing alert_thresholds admin-editable settings table.
INSERT INTO alert_thresholds (key, label, description, value, unit, category) VALUES
  ('lifefund.initial_limit',              'LifeFund Starting Limit',            'Credit limit granted to a first-time eligible patient',                          10000, 'NGN',   'lifefund'),
  ('lifefund.tier2_limit',                'LifeFund Tier 2 Limit',              'Limit unlocked after tier2_repayments_required successful repayments',           15000, 'NGN',   'lifefund'),
  ('lifefund.tier2_repayments_required',  'Repayments for Tier 2',              'Successful repayments needed to reach the Tier 2 limit',                          1,     'count', 'lifefund'),
  ('lifefund.tier3_limit',                'LifeFund Tier 3 Limit',              'Limit unlocked after tier3_repayments_required successful repayments',           25000, 'NGN',   'lifefund'),
  ('lifefund.tier3_repayments_required',  'Repayments for Tier 3',              'Successful repayments needed to reach the Tier 3 limit',                          3,     'count', 'lifefund'),
  ('lifefund.interest_rate_pct',          'Financing Charge',                   'Flat interest/financing charge applied to the principal',                         5,     'pct',   'lifefund'),
  ('lifefund.flat_fee',                   'Flat Processing Fee',                'Flat fee (NGN) added to every disbursed request, 0 to disable',                   0,     'NGN',   'lifefund'),
  ('lifefund.default_installments',       'Default Installment Count',          'Number of installments a new request is split into',                              3,     'count', 'lifefund'),
  ('lifefund.repayment_frequency_days',   'Repayment Frequency (days)',         'Days between installment due dates',                                               14,    'days',  'lifefund'),
  ('lifefund.min_account_age_days',       'Minimum Account Age',                'Days an account must exist before it can request LifeFund',                       30,    'days',  'lifefund'),
  ('lifefund.max_requested_amount',       'Maximum Single Request',             'Hard ceiling on a single request regardless of limit',                            50000, 'NGN',   'lifefund'),
  ('lifefund.auto_review_risk_threshold', 'Auto-Review Risk Threshold',         'Risk score (0-100) at or above which a request always goes to PENDING_REVIEW',    60,    'score', 'lifefund'),
  ('lifefund.max_defaults_before_suspend','Defaults Before Suspension',         'Number of past defaults after which the account is auto-SUSPENDED',              1,     'count', 'lifefund'),
  ('lifefund.cooling_off_hours',          'Cooling-Off Period',                 'Hours after accepting an agreement during which the patient may cancel',          24,    'hours', 'lifefund'),
  ('lifefund.auto_tier_upgrade_enabled',  'Automatic Tier Upgrades',            'When 1, limit tiers upgrade automatically once repayment/risk rules are met; when 0, an admin must manually raise the limit even after repayments', 1, 'bool', 'lifefund')
ON CONFLICT (key) DO NOTHING;
