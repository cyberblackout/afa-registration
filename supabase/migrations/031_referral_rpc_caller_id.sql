-- ============================================================
-- Migration 031: referral RPCs — explicit caller identity
--
-- Root cause behind B3, B5, B6, B9 (and the argument/identity
-- half of B4): the referral Edge Functions call these RPCs with
-- the SERVICE-ROLE client, where auth.uid() resolves to NULL.
-- Every function that used auth.uid() to identify the caller
-- therefore operated on "no user": codes were never persisted,
-- stats/analytics came back empty or Unauthorized, and the
-- unqualified user_id column reference inside these bodies
-- raised 42702 (ambiguous reference) under plpgsql's default
-- variable-conflict = error.
--
-- Fix pattern (already established by admin_set_user_role in
-- migration 021 and admin_soft_delete_user in migration 026):
--   * every RPC takes an explicit p_caller_id UUID,
--   * it is NEVER auth.uid() internally,
--   * the Edge Function passes auth.user.id from verifyAuth,
--   * EXECUTE is service_role only (the Edge Functions use
--     getSupabaseAdmin(); the frontend never calls referral
--     RPCs directly — verified by grep over src/).
--
-- NOTE: these are new signatures, so the old auth.uid() based
-- overloads are dropped explicitly — otherwise PostgREST would
-- keep resolving to the broken ones.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. generate_referral_code(p_caller_id)   [B3]
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_caller_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_new_code TEXT;
  v_counter INT := 0;
  v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_random_bytes BYTEA;
  v_i INT;
  v_byte_val INT;
BEGIN
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  LOOP
    v_random_bytes := gen_random_bytes(5);
    v_new_code := '';
    FOR v_i IN 0..4 LOOP
      v_byte_val := get_byte(v_random_bytes, v_i);
      v_new_code := v_new_code || SUBSTRING(v_alphabet FROM (v_byte_val % 32) + 1 FOR 1);
      v_byte_val := v_byte_val / 32;
      v_new_code := v_new_code || SUBSTRING(v_alphabet FROM (v_byte_val % 32) + 1 FOR 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE referral_code = v_new_code
    );
    v_counter := v_counter + 1;
    IF v_counter > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', v_counter;
    END IF;
  END LOOP;

  UPDATE profiles SET referral_code = v_new_code WHERE id = p_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  RETURN v_new_code;
END;
$$;

DROP FUNCTION IF EXISTS public.generate_referral_code();

-- ────────────────────────────────────────────────────────────
-- 2. get_referral_stats(p_caller_id)       [B6]
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT JSONB_BUILD_OBJECT(
    'total_invited', COUNT(*),
    'successful', COUNT(*) FILTER (WHERE status = 'reward_granted'),
    'pending', COUNT(*) FILTER (WHERE status IN ('pending','registered','purchase_completed')),
    'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
    'total_earned', COALESCE(SUM(reward_amount) FILTER (WHERE status = 'reward_granted'), 0)
  ) INTO v_result
  FROM referrals WHERE referrer_id = p_caller_id;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_referral_stats();

-- ────────────────────────────────────────────────────────────
-- 3. admin_get_referral_analytics(p_caller_id)  [B5]
--    Admin check is done server-side from profiles.role —
--    never from a client-supplied flag.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_referral_analytics(p_caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Authentication required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_caller_id AND role = 'admin') THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Unauthorized');
  END IF;

  SELECT JSONB_BUILD_OBJECT(
    'total_referrals', COUNT(*),
    'successful', COUNT(*) FILTER (WHERE r.status = 'reward_granted'),
    'pending', COUNT(*) FILTER (WHERE r.status IN ('pending','registered','purchase_completed')),
    'rejected', COUNT(*) FILTER (WHERE r.status = 'rejected'),
    'total_rewards_paid', COALESCE(SUM(r.reward_amount) FILTER (WHERE r.status = 'reward_granted'), 0),
    'unique_referrers', COUNT(DISTINCT r.referrer_id),
    'fraud_attempts', (SELECT COUNT(*) FROM referral_fraud_log),
    'daily_last_7', (
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT('date', d::DATE, 'count', COALESCE(c.cnt, 0)))
      FROM GENERATE_SERIES(CURRENT_DATE - 7, CURRENT_DATE, '1 day') d
      LEFT JOIN (SELECT DATE(created_at) as dt, COUNT(*) as cnt FROM referrals GROUP BY DATE(created_at)) c ON d::DATE = c.dt
    ),
    'top_referrers', (
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT('user_id', p.id, 'name', p.full_name, 'count', t.cnt, 'earned', t.earned))
      FROM (
        SELECT referrer_id, COUNT(*) as cnt, SUM(reward_amount) as earned
        FROM referrals WHERE status = 'reward_granted'
        GROUP BY referrer_id ORDER BY COUNT(*) DESC LIMIT 10
      ) t JOIN profiles p ON p.id = t.referrer_id
    )
  ) INTO v_result
  FROM referrals r;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_get_referral_analytics();

-- ────────────────────────────────────────────────────────────
-- 4. create_user_referral(p_referral_code,
--                         p_device_fingerprint,
--                         p_caller_id)        [B4]
--    Parameter names are now what the Edge Function sends.
--    The 42702 ambiguous `user_id` reference is gone: the
--    local variable no longer shadows the column.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_user_referral(
  p_referral_code TEXT,
  p_device_fingerprint TEXT,
  p_caller_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_referrer RECORD;
  v_new_referral_id UUID;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_referral_code IS NULL OR LENGTH(TRIM(p_referral_code)) = 0 THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'No referral code provided');
  END IF;

  SELECT id, full_name, referral_code INTO v_referrer
  FROM profiles WHERE referral_code = UPPER(TRIM(p_referral_code));

  IF v_referrer.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Invalid referral code');
  END IF;

  IF v_referrer.id = p_caller_id THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Cannot refer yourself');
  END IF;

  BEGIN
    INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
    VALUES (v_referrer.id, p_caller_id, UPPER(TRIM(p_referral_code)), 'registered')
    RETURNING id INTO v_new_referral_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Referral already recorded');
  END;

  IF p_device_fingerprint IS NOT NULL AND LENGTH(p_device_fingerprint) > 0 THEN
    UPDATE registrations
    SET device_fingerprint = p_device_fingerprint
    WHERE registrations.user_id = p_caller_id
      AND (registrations.device_fingerprint IS NULL OR registrations.device_fingerprint = '');
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'referral_id', v_new_referral_id,
    'referrer_id', v_referrer.id,
    'referrer_name', v_referrer.full_name
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_user_referral(text, text);

-- ────────────────────────────────────────────────────────────
-- 5. validate_referral_code(code, signup_email, signup_phone,
--                            p_caller_id)
--    The self-code check used auth.uid(), which is NULL under
--    the service role, so it never fired.
--    (The referral_enabled flag cast is fixed in migration 032.)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_referral_code(
  code TEXT,
  signup_email TEXT DEFAULT NULL,
  signup_phone TEXT DEFAULT NULL,
  p_caller_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_referrer RECORD;
  v_ref_enabled TEXT;
  v_early_warnings TEXT[] := '{}';
BEGIN
  SELECT value::TEXT INTO v_ref_enabled FROM app_settings WHERE key = 'referral_enabled';
  IF v_ref_enabled IS NULL OR v_ref_enabled <> 'true' THEN
    RETURN JSONB_BUILD_OBJECT('valid', false, 'reason', 'Referral system disabled');
  END IF;

  SELECT id, full_name, referral_code, phone, email INTO v_referrer
  FROM profiles WHERE referral_code = UPPER(TRIM(code));

  IF v_referrer.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('valid', false, 'reason', 'Invalid referral code');
  END IF;

  IF v_referrer.id = p_caller_id THEN
    RETURN JSONB_BUILD_OBJECT('valid', false, 'reason', 'Cannot use your own referral code');
  END IF;

  IF signup_email IS NOT NULL AND v_referrer.email IS NOT NULL AND LOWER(signup_email) = LOWER(v_referrer.email) THEN
    v_early_warnings := array_append(v_early_warnings, 'same_email');
  END IF;

  IF signup_phone IS NOT NULL AND v_referrer.phone IS NOT NULL AND signup_phone = v_referrer.phone THEN
    v_early_warnings := array_append(v_early_warnings, 'same_phone');
  END IF;

  IF array_length(v_early_warnings, 1) > 0 THEN
    RETURN JSONB_BUILD_OBJECT(
      'valid', false,
      'reason', 'Referral fraud detected: you cannot refer yourself',
      'warnings', to_jsonb(v_early_warnings)
    );
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'valid', true,
    'referrer_id', v_referrer.id,
    'referrer_name', v_referrer.full_name,
    'code', v_referrer.referral_code
  );
END;
$$;

DROP FUNCTION IF EXISTS public.validate_referral_code(text, text, text);

-- ────────────────────────────────────────────────────────────
-- 6. get_referral_transactions(p_caller_id)  [B9]
--    Fixes the 42702 `user_id` ambiguity (the local variable
--    shadowed wallet_transactions.user_id) by naming the
--    caller explicitly.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_transactions(p_caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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
  ) INTO v_result
  FROM wallet_transactions wt
  WHERE wt.user_id = p_caller_id
    AND wt.type = 'credit'
    AND wt.description ILIKE '%referral%'
  LIMIT 20;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

DROP FUNCTION IF EXISTS public.get_referral_transactions();

-- ────────────────────────────────────────────────────────────
-- 7. Privileges: service_role only.
--    These are reachable from PostgREST; before this migration
--    EXECUTE was granted to PUBLIC (the `=X` entry left behind
--    when migration 019 recreated the functions after migration
--    010's per-role revokes), which would have turned the new
--    p_caller_id parameters into a caller-impersonation hole.
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_referral_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_stats(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_referral_analytics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_referral_analytics(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_user_referral(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_referral(text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.validate_referral_code(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_referral_transactions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_transactions(uuid) TO service_role;
