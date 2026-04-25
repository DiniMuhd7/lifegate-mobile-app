-- Migration 029: Seed the default LifeGate admin account.
-- Uses INSERT … ON CONFLICT DO NOTHING so re-running the migration is safe.
--
-- The password hash below is bcrypt(DefaultCost=10) of the initial admin
-- password. Rotate via the auth reset-password flow after first login.

INSERT INTO users (name, email, password_hash, role)
VALUES (
    'LifeGate Admin',
    'lifegatebydshub@gmail.com',
    '$2a$10$0os19tchgoLR8/S4pXEn9up4O1As3KvfkENGd/6RXPQm7pJ7jTEDe',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
