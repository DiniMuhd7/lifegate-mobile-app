-- Migration 053: Synchronize default admin credentials across existing environments.
--
-- Why this exists:
-- - Earlier deployments may still have the legacy admin email.
-- - The old seed migration used DO NOTHING, so existing rows were not updated.
--
-- This migration safely normalizes to the new default admin identity.

-- 1) If only the legacy admin email exists, rename it to the new admin email.
UPDATE users
SET email = 'lawaladewale2018@gmail.com',
    updated_at = NOW()
WHERE email = 'lifegatebydshub@gmail.com'
  AND NOT EXISTS (
      SELECT 1 FROM users WHERE email = 'lawaladewale2018@gmail.com'
  );

-- 2) Ensure the new default admin account exists and has the expected hash/role.
INSERT INTO users (name, email, password_hash, role)
VALUES (
    'LifeGate Admin',
    'lawaladewale2018@gmail.com',
    '$2a$10$vXxljjmJav.lYlIZ2Z0KOe9NYH0UV9KWM7sNZAcsLl3/6NgKbzRti',
    'admin'
)
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'admin',
    updated_at = NOW();