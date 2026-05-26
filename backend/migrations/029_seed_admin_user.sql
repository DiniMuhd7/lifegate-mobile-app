-- Migration 029: Seed the default LifeGate admin account.
-- Uses INSERT … ON CONFLICT DO NOTHING so re-running the migration is safe.
--
-- The password hash below is bcrypt(DefaultCost=10) of the initial admin
-- password. Rotate via the auth reset-password flow after first login.

INSERT INTO users (name, email, password_hash, role)
VALUES (
    'LifeGate Admin',
    'lawaladewale2018@gmail.com',
    '$2a$10$vXxljjmJav.lYlIZ2Z0KOe9NYH0UV9KWM7sNZAcsLl3/6NgKbzRti',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
