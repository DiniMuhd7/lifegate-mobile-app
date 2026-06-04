-- Migration 054: Harden default admin credential sync.
--
-- Why this exists:
-- - Some environments may still have older admin identities from previous seeds.
-- - Existing environments can miss one-off manual updates.
--
-- This migration normalizes known legacy admin emails to the canonical admin,
-- then guarantees the canonical admin exists with the expected hash and role.

-- 1) Promote legacy admin emails to canonical email when canonical does not yet exist.
UPDATE users
SET email = 'adewale@dshub.com.ng',
    updated_at = NOW()
WHERE LOWER(email) IN ('lifegatebydshub@gmail.com', 'lawaladewale2018@gmail.com')
  AND NOT EXISTS (
      SELECT 1 FROM users WHERE LOWER(email) = 'adewale@dshub.com.ng'
  );

-- 2) Ensure canonical admin exists with expected credentials and role.
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

-- 3) If legacy admin rows still exist (because canonical already existed),
-- keep them in sync too so admins can still recover access with known defaults.
UPDATE users
SET password_hash = '$2a$10$PNZKQX8C3i8WpopCB5QMjeTpUoLkIVKu20OdsUj.KeCEFrywlPIPS',
    role = 'admin',
    updated_at = NOW()
WHERE LOWER(email) IN ('lifegatebydshub@gmail.com', 'lawaladewale2018@gmail.com');
