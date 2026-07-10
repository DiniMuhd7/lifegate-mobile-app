-- 060: Feature flags via alert_thresholds table.
--
-- Adds a "feature" category to the existing alert_thresholds table so that
-- admin-controlled on/off switches for patient-facing features can be toggled
-- from the existing Alert & Threshold Settings screen without new infrastructure.
--
-- Convention:
--   value   = 1 → feature is ENABLED  (any other value = disabled)
--   unit    = '' (empty — no numeric unit applies)
--   enabled = TRUE (the row itself is always active; "value" controls the flag)
--
-- The mobile registration screen reads GET /auth/features (public, rate-limited)
-- which returns the current enabled/disabled state of each feature flag.

INSERT INTO alert_thresholds (key, label, description, value, unit, category, enabled)
VALUES (
  'feature.free_health_screening',
  'Free Health Screening',
  'When enabled, patients see the "Free Health Screening" multi-select dropdown during registration, allowing them to indicate interest in: Subsidized Genotype Test, Vital Signs Check, BMI Assessment, Blood Group Test, Packed Cell Volume, Malaria Test, Hepatitis Screening, HIV Screening, and other basic health screenings.',
  1,   -- 1 = enabled, 0 = disabled
  '',  -- no numeric unit
  'feature',
  TRUE
)
ON CONFLICT (key) DO NOTHING;
