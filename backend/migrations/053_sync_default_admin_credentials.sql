-- Migration 053: Synchronize default admin credentials across existing environments.
--
-- Why this exists:
-- - Earlier deployments may still have the legacy admin email.
-- - The old seed migration used DO NOTHING, so existing rows were not updated.
--
-- This migration safely normalizes to the new default admin identity.

-- 1) If only the legacy admin email exists, rename it to the new admin email.
UPDATE users
SET email = 'adewale@dshub.com.ng',
    updated_at = NOW()
WHERE email = 'lifegatebydshub@gmail.com'
  AND NOT EXISTS (
      SELECT 1 FROM users WHERE email = 'adewale@dshub.com.ng'
  );

-- 2) Ensure the new default admin account exists and has the expected hash/role.
INSERT INTO users (name, email, password_hash, role)
VALUES (
    'LifeGate Admin',
    'adewale@dshub.com.ng',
    '$2a$10$PNZKQX8C3i8WpopCB5QMjeTpUoLkIVKu20OdsUj.KeCEFrywlPIPS',
    'admin'
)
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'admin',
    updated_at = NOW();