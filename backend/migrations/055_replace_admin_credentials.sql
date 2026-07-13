-- Migration 055: Replace seeded admin credentials.
-- Removes prior default admin identities and provisions the requested SPAN/EDIS
-- admin accounts with bcrypt-hashed passwords.

DELETE FROM users
WHERE role = 'admin'
  AND LOWER(email) IN (
    'lifegatebydshub@gmail.com',
    'lawaladewale2018@gmail.com',
    'adewale@dshub.com.ng'
  );

INSERT INTO users (name, email, password_hash, role)
VALUES
  (
    'SPAN Admin',
    'span@dshub.com.ng',
    '$2a$10$nwkD/kv1H6aLAymdMxLOi.Zo4JK/xijkN2SW/BYAL14SEdXDeVUOW',
    'admin'
  ),
  (
    'EDIS Admin',
    'edis@dshub.com.ng',
    '$2a$10$kwscZK8B4rFqLmyVDaFb0.zMFn3eJH/2TOHOeEldia0suckbwlqBy',
    'admin'
  )
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'admin',
    updated_at = NOW();
