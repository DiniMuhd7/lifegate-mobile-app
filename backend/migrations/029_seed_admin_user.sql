-- Migration 029: Seed the default LifeGate admin account.
-- Uses INSERT … ON CONFLICT DO NOTHING so re-running the migration is safe.
--
-- The password hash below is bcrypt(DefaultCost=10) of the initial admin
-- password. Rotate via the auth reset-password flow after first login.

INSERT INTO users (name, email, password_hash, role)
VALUES (
    'LifeGate Admin',
    'adewale@dshub.com.ng',
    '$2a$10$PNZKQX8C3i8WpopCB5QMjeTpUoLkIVKu20OdsUj.KeCEFrywlPIPS',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
