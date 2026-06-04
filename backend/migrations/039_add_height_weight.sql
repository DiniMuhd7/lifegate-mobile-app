-- 039: Add height and weight fields to users for BMI calculation.
-- These are stored in metric units (cm / kg) and are optional — patients
-- supply them through the health-profile form. When both are present the
-- backend computes BMI and injects it into the EDIS system prompt so the
-- AI can incorporate weight-dependent dosing, obesity-related risk signals,
-- and BMI-driven differential reasoning.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5, 2);
