-- 004: payments & credits
-- Credits wallet: one row per user, updated atomically
CREATE TABLE IF NOT EXISTS credits (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance        INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment transactions log
CREATE TABLE IF NOT EXISTS payment_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tx_ref          VARCHAR(255) UNIQUE NOT NULL,
    flw_tx_id       VARCHAR(255),          -- Flutterwave transaction_id (set on verify)
    amount          INTEGER NOT NULL,       -- naira amount (e.g. 2000)
    credits_granted INTEGER NOT NULL,       -- credits added on success
    status          VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending | success | failed
    bundle_id       VARCHAR(50) NOT NULL,   -- '2000' | '5000' | '10000'
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit deduction log (one row per diagnosis that consumed a credit)
CREATE TABLE IF NOT EXISTS credit_deductions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diagnosis_id UUID REFERENCES diagnoses(id),
    amount       INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx_ref  ON payment_transactions(tx_ref);
CREATE INDEX IF NOT EXISTS idx_credit_deductions_user_id    ON credit_deductions(user_id);
