ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mdcn_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mdcn_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_mdcn_verified ON users(mdcn_verified) WHERE role = 'professional';
