-- Migration: 028_afa_role_based_pricing.sql
-- Configurable, role-based AFA registration pricing.
--
-- Storage reuses the EXISTING pricing table and the EXISTING afa_registration
-- row: `normal_price` keeps its meaning (what a normal user pays) and the
-- pre-existing `agent_price` column becomes the agent price. No settings row is
-- added, renamed or reseeded, so no historical configuration or transaction is
-- altered by this migration.
--
-- Rules honoured here:
--   * Role is resolved from profiles.role inside the transaction, never from a
--     JWT claim, request body or client state.
--   * p_caller_id is an explicit parameter (NEVER auth.uid()) because every
--     caller is an Edge Function using the service-role client, where
--     auth.uid() is NULL.
--   * Postgres numeric only; no floats anywhere in the money path.
--   * Nothing here reads or writes an existing wallet_transactions or
--     registrations row.

-- ─────────────────────────────────────────────────────────────
-- 1. Registrations record what was actually charged, and at which tier
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS amount_charged NUMERIC(12,2);

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_pricing_tier_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_pricing_tier_check
  CHECK (pricing_tier IS NULL OR pricing_tier IN ('normal', 'agent'));

-- Existing rows keep amount_charged/pricing_tier NULL: historical data is
-- deliberately left untouched.

-- ─────────────────────────────────────────────────────────────
-- 2. Guard the AFA prices (scoped to the afa_registration row only so the
--    other pricing rows keep their current shape)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.pricing
  DROP CONSTRAINT IF EXISTS pricing_afa_registration_positive;

ALTER TABLE public.pricing
  ADD CONSTRAINT pricing_afa_registration_positive
  CHECK (
    key <> 'afa_registration'
    OR (
      COALESCE(amount, 0) > 0
      AND COALESCE(normal_price, 0) > 0
      AND COALESCE(agent_price, 0) > 0
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. One atomic RPC: resolve role -> price -> lock wallet -> verify -> debit
--    -> insert registration + transaction + order, all in one transaction.
--    Any failure rolls the whole thing back, so no compensating refund is
--    required and the balance can never go negative.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_afa_registration(
  p_caller_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_ghana_card_id TEXT,
  p_address TEXT,
  p_date_of_birth TEXT,
  p_occupation TEXT,
  p_expected_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_tier TEXT;
  v_price NUMERIC;
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_reg_id UUID;
  v_txn_id UUID;
BEGIN
  -- 1. Caller identity is supplied by the Edge Function after JWT verification
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Role comes from profiles at request time (never from the client)
  SELECT role INTO v_role
  FROM profiles
  WHERE id = p_caller_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Admin callers are treated exactly like normal users.
  v_tier := CASE WHEN v_role = 'agent' THEN 'agent' ELSE 'normal' END;

  -- 3. Resolve the price for that tier inside this transaction
  SELECT CASE WHEN v_tier = 'agent' THEN agent_price ELSE normal_price END
    INTO v_price
  FROM pricing
  WHERE key = 'afa_registration'
    AND active = true;

  IF NOT FOUND OR v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'Registration fee is not configured';
  END IF;

  -- 4. Price-changed guard. p_expected_amount is comparison ONLY; it is never
  --    used to decide what is charged.
  IF p_expected_amount IS NOT NULL AND p_expected_amount <> v_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICE_CHANGED',
      'error', 'The registration fee has changed. Please review the updated price and confirm.',
      'current_price', v_price,
      'tier', v_tier
    );
  END IF;

  -- 5. Lock the wallet row, then verify against the resolved price
  SELECT wallet_balance INTO v_balance
  FROM profiles
  WHERE id = p_caller_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < v_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_BALANCE',
      'error', 'Insufficient wallet balance. Please top up your wallet.',
      'required', v_price,
      'balance', COALESCE(v_balance, 0),
      'tier', v_tier
    );
  END IF;

  -- 6. Debit (same statement shape as debit_wallet; row already locked above)
  UPDATE profiles
  SET wallet_balance = wallet_balance - v_price,
      updated_at = NOW()
  WHERE id = p_caller_id
  RETURNING wallet_balance INTO v_new_balance;

  INSERT INTO wallet_transactions (user_id, type, amount, description)
  VALUES (p_caller_id, 'debit', v_price, 'AFA Registration Fee - ' || p_full_name)
  RETURNING id INTO v_txn_id;

  -- 7. Registration records the amount actually charged and the tier used
  INSERT INTO registrations (
    user_id, full_name, phone, email, ghana_card_id, address,
    date_of_birth, occupation, status, amount_charged, pricing_tier
  ) VALUES (
    p_caller_id, p_full_name, p_phone, p_email, p_ghana_card_id, p_address,
    NULLIF(p_date_of_birth, '')::date, p_occupation, 'pending', v_price, v_tier
  )
  RETURNING id INTO v_reg_id;

  -- 8. Timeline
  INSERT INTO registration_timeline (registration_id, changed_by, status, note)
  VALUES (v_reg_id, p_caller_id, 'pending',
          'Registration submitted - awaiting admin validation');

  -- 9. Linked order, using the very same charged amount
  INSERT INTO orders (
    user_id, amount, description, status, payment_status, source_type, source_id
  ) VALUES (
    p_caller_id, v_price, 'AFA Registration - ' || p_full_name,
    'pending', 'paid', 'afa_registration', v_reg_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_reg_id,
    'fee_charged', v_price,
    'amount_charged', v_price,
    'pricing_tier', v_tier,
    'transaction_id', v_txn_id,
    'new_balance', v_new_balance,
    'message', 'Registration submitted successfully'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_afa_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_afa_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_afa_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_afa_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Admin-only, audit-logged write of both AFA prices
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_afa_pricing(
  p_caller_id UUID,
  p_normal_price NUMERIC,
  p_agent_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_old_normal NUMERIC;
  v_old_agent NUMERIC;
  v_max NUMERIC := 1000000;
BEGIN
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Server-verified admin check; role read from profiles, never from the JWT
  SELECT role INTO v_role FROM profiles WHERE id = p_caller_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  -- Validation identical to the frontend Zod schema, with specific messages
  IF p_normal_price IS NULL OR p_agent_price IS NULL THEN
    RAISE EXCEPTION 'Both prices are required';
  END IF;
  IF p_normal_price <= 0 OR p_agent_price <= 0 THEN
    RAISE EXCEPTION 'Price must be greater than 0';
  END IF;
  IF p_normal_price <> round(p_normal_price, 2) OR p_agent_price <> round(p_agent_price, 2) THEN
    RAISE EXCEPTION 'Price supports a maximum of 2 decimal places';
  END IF;
  IF p_normal_price > v_max OR p_agent_price > v_max THEN
    RAISE EXCEPTION 'Price cannot exceed %', to_char(v_max, 'FM999,999,990.00');
  END IF;

  SELECT normal_price, agent_price
    INTO v_old_normal, v_old_agent
  FROM pricing
  WHERE key = 'afa_registration'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AFA registration pricing is not configured';
  END IF;

  UPDATE pricing
  SET normal_price = p_normal_price,
      agent_price  = p_agent_price,
      amount       = p_normal_price,
      updated_at   = NOW()
  WHERE key = 'afa_registration';

  IF v_old_normal IS DISTINCT FROM p_normal_price THEN
    INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
    VALUES (
      p_caller_id, 'pricing_update', 'pricing', 'afa_registration:normal_price',
      jsonb_build_object('value', v_old_normal),
      jsonb_build_object('value', p_normal_price),
      NOW()
    );
  END IF;

  IF v_old_agent IS DISTINCT FROM p_agent_price THEN
    INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
    VALUES (
      p_caller_id, 'pricing_update', 'pricing', 'afa_registration:agent_price',
      jsonb_build_object('value', v_old_agent),
      jsonb_build_object('value', p_agent_price),
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'normal_price', p_normal_price,
    'agent_price', p_agent_price,
    'old_normal_price', v_old_normal,
    'old_agent_price', v_old_agent
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_afa_pricing(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_afa_pricing(UUID, NUMERIC, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_afa_pricing(UUID, NUMERIC, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_afa_pricing(UUID, NUMERIC, NUMERIC) TO service_role;
