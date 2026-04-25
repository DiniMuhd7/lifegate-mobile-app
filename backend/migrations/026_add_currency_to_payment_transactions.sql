-- 026: add currency column to payment_transactions
-- Enables multi-currency support (NGN and USD) for Flutterwave payments.
-- Existing rows default to 'NGN' to preserve backward compatibility.
ALTER TABLE payment_transactions
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'NGN';
