-- Reset all Lifecoins data (DEV / TEST only — never run this in production)
-- Run with: psql $DATABASE_URL -f backend/scripts/reset-lifecoins-dev.sql

TRUNCATE TABLE lifecoins_transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE lifecoins_wallet       RESTART IDENTITY CASCADE;
TRUNCATE TABLE checkin_claims         RESTART IDENTITY CASCADE;
TRUNCATE TABLE checkin_answers        RESTART IDENTITY CASCADE;

-- Reset conversion rate to default
UPDATE lifecoins_config SET value = '10' WHERE key = 'naira_per_coin';
