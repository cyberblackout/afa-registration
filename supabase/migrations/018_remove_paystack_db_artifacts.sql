-- Migration: Remove all Paystack database artifacts
-- Paystack secret key must ONLY exist as a Supabase Edge Function environment
-- secret (PAYSTACK_SECRET_KEY), never in the database.

-- 1. Delete the paystack_secret_key row from app_settings (if it exists)
DELETE FROM app_settings WHERE key = 'paystack_secret_key';

-- 2. Drop the get_paystack_config() function (dead code, no longer called by any Edge Function)
DROP FUNCTION IF EXISTS public.get_paystack_config();

-- 3. Delete any Paystack-related rows from payment_config (if they exist)
DELETE FROM payment_config WHERE key ILIKE '%paystack%';

-- 4. Verify: these queries should return 0 rows after migration
-- SELECT * FROM app_settings WHERE key = 'paystack_secret_key';
-- SELECT * FROM payment_config WHERE key ILIKE '%paystack%';
