-- The account-age requirement is no longer a LifeFund eligibility rule.
DELETE FROM alert_thresholds
WHERE key = 'lifefund.min_account_age_days';
