-- ============================================================
-- REFERRAL SYSTEM HARDENING
-- Migration 019: Rate limiting, secure code generation, race
-- condition protection, PII masking, completion guard
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. RATE LIMITING TABLE
-- DB-backed (survives Edge Function cold starts)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_action
  ON rate_limits(key, action, created_at);

-- Auto-cleanup: prevent unbounded growth (run via pg_cron or manual)
-- DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '24 hours';

-- ────────────────────────────────────────────────────────────
-- 2. RATE LIMIT CHECK FUNCTION
-- Returns TRUE if the action is allowed, FALSE if rate limited
-- Cleans expired entries atomically before checking
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_action TEXT,
  p_max_attempts INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INT;
BEGIN
  -- Purge expired entries for this key+action
  DELETE FROM rate_limits
  WHERE key = p_key
    AND action = p_action
    AND created_at < NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Count current entries in window
  SELECT COUNT(*) INTO current_count
  FROM rate_limits
  WHERE key = p_key AND action = p_action;

  -- Block if over limit
  IF current_count >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Record this attempt
  INSERT INTO rate_limits(key, action) VALUES (p_key, p_action);
  RETURN TRUE;
END;
$$;

-- Only service_role (Edge Functions) should call this
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

-- ────────────────────────────────────────────────────────────
-- 3. SECURE REFERRAL CODE GENERATION
-- Uses gen_random_bytes + base32 encoding for high entropy
-- Format: 8 alphanumeric chars (A-Z, 2-7), ~110B possibilities
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID := auth.uid();
  new_code TEXT;
  counter INT := 0;
  alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  random_bytes BYTEA;
  i INT;
  byte_val INT;
BEGIN
  LOOP
    -- Generate 5 random bytes → 8 base32 characters
    random_bytes := gen_random_bytes(5);
    new_code := '';
    FOR i IN 0..4 LOOP
      byte_val := get_byte(random_bytes, i);
      new_code := new_code || SUBSTRING(alphabet FROM (byte_val % 32) + 1 FOR 1);
      byte_val := byte_val / 32;
      new_code := new_code || SUBSTRING(alphabet FROM (byte_val % 32) + 1 FOR 1);
    END LOOP;

    -- Ensure uniqueness (retry on collision, max 20 attempts)
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE referral_code = new_code
    );
    counter := counter + 1;
    IF counter > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', counter;
    END IF;
  END LOOP;

  UPDATE profiles SET referral_code = new_code WHERE id = user_id;
  RETURN new_code;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. UPDATED process_referral_reward
-- Adds: SELECT FOR UPDATE (race condition protection)
-- Adds: Registration status guard (must be truly completed)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_referral_reward(
  registration_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  referred_user_id UUID;
  referrer_id_var UUID;
  reg RECORD;
  referrer_profile RECORD;
  referral_record RECORD;
  reward_amt NUMERIC(12,2);
  daily_count INT;
  max_daily INT;
  fraud_reasons TEXT[] := '{}';
  dup_count INT;
BEGIN
  -- Get registration details
  SELECT * INTO reg FROM registrations WHERE id = registration_id;
  IF reg.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Registration not found');
  END IF;

  -- ─── GUARD: Registration must actually be completed ───
  IF reg.status != 'completed' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Registration not completed yet');
  END IF;

  referred_user_id := reg.user_id;

  -- Find the referral record WITH ROW LOCK (prevents race condition)
  SELECT * INTO referral_record
  FROM referrals
  WHERE referred_id = referred_user_id
    AND status IN ('registered', 'purchase_completed')
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF referral_record.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'No valid referral found');
  END IF;

  -- Check if already rewarded (idempotency guard)
  IF referral_record.status = 'reward_granted' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Reward already granted');
  END IF;

  referrer_id_var := referral_record.referrer_id;

  -- Get referrer profile
  SELECT * INTO referrer_profile FROM profiles WHERE id = referrer_id_var;

  -- ─── FRAUD CHECK 1: Self-referral ───
  IF referrer_id_var = referred_user_id THEN
    fraud_reasons := array_append(fraud_reasons, 'self_referral');
  END IF;

  -- ─── FRAUD CHECK 2: Same phone number ───
  IF referrer_profile.phone IS NOT NULL AND reg.phone IS NOT NULL
     AND referrer_profile.phone = reg.phone THEN
    fraud_reasons := array_append(fraud_reasons, 'same_phone');
  END IF;

  -- ─── FRAUD CHECK 3: Same email ───
  IF referrer_profile.email IS NOT NULL AND reg.email IS NOT NULL
     AND LOWER(referrer_profile.email) = LOWER(reg.email) THEN
    fraud_reasons := array_append(fraud_reasons, 'same_email');
  END IF;

  -- ─── FRAUD CHECK 4: Same device fingerprint ───
  IF reg.device_fingerprint IS NOT NULL AND LENGTH(reg.device_fingerprint) > 0 THEN
    SELECT COUNT(*) INTO dup_count
    FROM registrations r2
    JOIN referrals ref2 ON ref2.referred_id = r2.user_id
    WHERE r2.device_fingerprint = reg.device_fingerprint
      AND ref2.referrer_id = referrer_id_var
      AND r2.id != registration_id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'same_device');
    END IF;
  END IF;

  -- ─── FRAUD CHECK 5: Multiple accounts (same phone/email across different users) ───
  IF reg.phone IS NOT NULL THEN
    SELECT COUNT(*) INTO dup_count
    FROM profiles
    WHERE phone = reg.phone AND id != referrer_id_var AND id != referred_user_id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'phone_reused');
    END IF;
  END IF;

  IF reg.email IS NOT NULL THEN
    SELECT COUNT(*) INTO dup_count
    FROM profiles
    WHERE email = reg.email AND id != referrer_id_var AND id != referred_user_id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'email_reused');
    END IF;
  END IF;

  -- Check if referred user's phone/email matches any other registration's by the referrer
  IF reg.phone IS NOT NULL THEN
    SELECT COUNT(*) INTO dup_count
    FROM registrations r2
    JOIN referrals ref2 ON ref2.referred_id = r2.user_id
    WHERE r2.phone = reg.phone
      AND ref2.referrer_id = referrer_id_var
      AND r2.id != registration_id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'phone_reused_in_referrals');
    END IF;
  END IF;

  IF reg.email IS NOT NULL THEN
    SELECT COUNT(*) INTO dup_count
    FROM registrations r2
    JOIN referrals ref2 ON ref2.referred_id = r2.user_id
    WHERE r2.email = reg.email
      AND ref2.referrer_id = referrer_id_var
      AND r2.id != registration_id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'email_reused_in_referrals');
    END IF;
  END IF;

  -- If any fraud detected, reject the referral
  IF array_length(fraud_reasons, 1) > 0 THEN
    UPDATE referrals
    SET status = 'rejected', fraud_check_passed = false,
        fraud_note = array_to_string(fraud_reasons, ', ')
    WHERE id = referral_record.id;

    INSERT INTO referral_fraud_log (referral_id, detected_by, details)
    VALUES (referral_record.id, 'auto', JSONB_BUILD_OBJECT(
      'reasons', to_jsonb(fraud_reasons),
      'registration_phone', reg.phone,
      'registration_email', reg.email,
      'referrer_phone', referrer_profile.phone,
      'referrer_email', referrer_profile.email,
      'device_fingerprint', reg.device_fingerprint
    ));

    RETURN JSONB_BUILD_OBJECT(
      'success', false, 'error', 'Fraud detected',
      'reasons', to_jsonb(fraud_reasons)
    );
  END IF;

  -- ─── DAILY LIMIT CHECK ───
  SELECT value::INT INTO max_daily FROM app_settings WHERE key = 'referral_max_daily';
  IF max_daily IS NULL THEN max_daily := 50; END IF;

  SELECT COUNT(*) INTO daily_count
  FROM referral_rewards
  WHERE user_id = referrer_id_var
    AND created_at >= CURRENT_DATE
    AND status = 'paid';

  IF daily_count >= max_daily THEN
    UPDATE referrals
    SET status = 'rejected', fraud_check_passed = false,
        fraud_note = 'Daily reward limit reached'
    WHERE id = referral_record.id;
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Daily reward limit reached');
  END IF;

  -- ─── GRANT REWARD (atomic) ───
  SELECT value::NUMERIC INTO reward_amt FROM app_settings WHERE key = 'referral_reward_amount';
  IF reward_amt IS NULL THEN reward_amt := 1; END IF;

  UPDATE referrals
  SET status = 'reward_granted', reward_amount = reward_amt,
      order_id = registration_id, fraud_check_passed = true, completed_at = NOW()
  WHERE id = referral_record.id;

  INSERT INTO referral_rewards (referral_id, user_id, amount, status, paid_at)
  VALUES (referral_record.id, referrer_id_var, reward_amt, 'paid', NOW());

  UPDATE profiles SET wallet_balance = wallet_balance + reward_amt WHERE id = referrer_id_var;

  INSERT INTO wallet_transactions (user_id, type, amount, description, reference, status)
  VALUES (referrer_id_var, 'credit', reward_amt,
          'Referral reward for successful customer referral',
          'REF-' || referral_record.id, 'completed');

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'referrer_id', referrer_id_var,
    'amount', reward_amt,
    'referral_id', referral_record.id
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. CREATE REFERRAL (server-side, replaces client-side insert)
-- Called during registration after auth.signUp succeeds
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_user_referral(
  p_referral_code TEXT,
  p_device_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID := auth.uid();
  referrer RECORD;
  new_referral_id UUID;
BEGIN
  -- Validate inputs
  IF user_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_referral_code IS NULL OR LENGTH(TRIM(p_referral_code)) = 0 THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'No referral code provided');
  END IF;

  -- Look up referrer
  SELECT id, full_name, referral_code INTO referrer
  FROM profiles WHERE referral_code = UPPER(TRIM(p_referral_code));

  IF referrer.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Self-referral check
  IF referrer.id = user_id THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Cannot refer yourself');
  END IF;

  -- Check for duplicate referral record
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = user_id) THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Referral already recorded');
  END IF;

  -- Create the referral record (bypasses RLS via SECURITY DEFINER)
  INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
  VALUES (referrer.id, user_id, UPPER(TRIM(p_referral_code)), 'registered')
  RETURNING id INTO new_referral_id;

  -- Update device fingerprint on the registration if provided
  IF p_device_fingerprint IS NOT NULL AND LENGTH(p_device_fingerprint) > 0 THEN
    UPDATE registrations
    SET device_fingerprint = p_device_fingerprint
    WHERE user_id = user_id
      AND (device_fingerprint IS NULL OR device_fingerprint = '');
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'referral_id', new_referral_id,
    'referrer_id', referrer.id,
    'referrer_name', referrer.full_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_user_referral(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_user_referral(text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. GET REFERRAL TRANSACTIONS (masked PII)
-- Replaces direct wallet_transactions query in ReferralPage
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID := auth.uid();
  result JSONB;
BEGIN
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', wt.id,
      'type', wt.type,
      'amount', wt.amount,
      'description', wt.description,
      'reference', wt.reference,
      'status', wt.status,
      'created_at', wt.created_at
    )
    ORDER BY wt.created_at DESC
  ) INTO result
  FROM wallet_transactions wt
  WHERE wt.user_id = user_id
    AND wt.type = 'credit'
    AND wt.description ILIKE '%referral%'
  LIMIT 20;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. GET MY REFERRALS (with PII masking for referrer view)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_referrals_masked()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID := auth.uid();
  result JSONB;
BEGIN
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', r.id,
      'referrer_id', r.referrer_id,
      'referred_id', r.referred_id,
      'referral_code', r.referral_code,
      'status', r.status,
      'reward_amount', r.reward_amount,
      'fraud_check_passed', r.fraud_check_passed,
      'created_at', r.created_at,
      'completed_at', r.completed_at,
      'referred_profile', JSONB_BUILD_OBJECT(
        'full_name', p.full_name,
        'email', LEFT(p.email, 1) || '***@' || SPLIT_PART(p.email, '@', 2),
        'phone', LEFT(p.phone, 3) || ' **** ' || RIGHT(p.phone, 3)
      )
    )
    ORDER BY r.created_at DESC
  ) INTO result
  FROM referrals r
  LEFT JOIN profiles p ON p.id = r.referred_id
  WHERE r.referrer_id = user_id;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
