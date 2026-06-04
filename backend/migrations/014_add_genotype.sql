-- Migration 014: add genotype column to users table
-- Genotype (e.g. AA, AS, SS, SC, AC) is clinically significant in Nigeria
-- due to the high prevalence of sickle-cell trait and disease.

ALTER TABLE users ADD COLUMN IF NOT EXISTS genotype VARCHAR(10);
