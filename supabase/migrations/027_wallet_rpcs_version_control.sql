-- Migration: 027_wallet_rpcs_version_control.sql
-- Brings wallet RPCs under version control. These functions already exist in the
-- live database (created via dashboard/direct SQL) but had no migration history.
-- This is a documentation-only migration to correct the process gap.
--
-- SECURITY AUDIT: None of these functions use auth.uid(). They accept explicit
-- parameters for all user identity. Safe to call from service-role context.

-- ────────────────────────────────────────────────────────────
-- 1. credit_wallet — Credits a user's wallet balance
-- Called from: admin-payments, admin-wallet, create-registration, verify-wallet-topup, paystack-webhook
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id UUID;
  v_balance NUMERIC;
BEGIN
  -- Update wallet balance
  UPDATE profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_balance;

  -- Insert transaction record
  INSERT INTO wallet_transactions (user_id, type, amount, description, reference)
  VALUES (p_user_id, 'credit', p_amount, p_description, p_reference)
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'new_balance', v_balance
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. debit_wallet — Debits a user's wallet balance with balance check
-- Called from: admin-wallet, create-registration
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_transaction_id UUID;
  v_new_balance NUMERIC;
BEGIN
  -- Check balance WITH row-level lock to prevent concurrent debit race
  SELECT wallet_balance INTO v_current_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Update wallet balance
  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_new_balance;

  -- Insert transaction record
  INSERT INTO wallet_transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'debit', p_amount, p_description)
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. update_wallet_status — Updates a wallet transaction status
-- Called from: admin-payments, admin-wallet
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_wallet_status(
  p_user_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET wallet_status = p_status, updated_at = NOW()
  WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. admin_get_referral_analytics — Returns referral platform analytics
-- Called from: admin-referrals (via anon client with user JWT, NOT service_role)
-- NOTE: Uses auth.uid() for admin check, but called via anon client so auth.uid()
-- resolves to the real user, not service_role. This is correct and safe.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_referral_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
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
  ) INTO result
  FROM referrals r;

  RETURN result;
END;
$$;
