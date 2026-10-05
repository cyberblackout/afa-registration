-- ============================================================
-- 032 app_settings jsonb scalar reads + reward idempotency
-- (audit B1, B2, B15)
--
-- app_settings.value is jsonb. The referral rows are stored as JSON
-- *strings* (referral_max_daily = "50", referral_reward_amount = "1",
-- referral_enabled = "true"), so:
--   B1  value::INT / value::NUMERIC on a JSON string raises 22023.
--       process_referral_reward has never granted a referral reward in
--       production.
--   B2  value::TEXT yields '"true"' (JSON-quoted), so
--       `v_ref_enabled <> 'true'` was always true and validate_referral_code
--       answered "Referral system disabled" for every code.
--   B15 The "already rewarded" guard in process_referral_reward sits behind
--       a status filter that only matched registered/purchase_completed, so
--       the guard was unreachable: retrying an already-granted referral
--       reported "No valid referral found" instead of the real reason.
-- Same broken cast class fixed in apply_for_agent (agent_fee /
-- agent_auto_approve) and admin_retry_referral_reward.
--
-- Read pattern: (value #>> '{}') returns the scalar as plain text for both
-- jsonb strings and jsonb numbers; a regex guard then falls back to the
-- previous default instead of raising.
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_referral_code(code text, signup_email text DEFAULT NULL::text, signup_phone text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_referrer RECORD;
  v_ref_enabled TEXT;
  v_early_warnings TEXT[] := '{}';
BEGIN
  -- B2: value is jsonb, so value::TEXT on this row yields "true" (JSON
  -- quoted) and the <> 'true' test was always true: every validation was
  -- rejected with "Referral system disabled".
  SELECT value #>> '{}' INTO v_ref_enabled FROM app_settings WHERE key = 'referral_enabled';
  IF v_ref_enabled IS NULL OR lower(v_ref_enabled) <> 'true' THEN
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
$function$;



CREATE OR REPLACE FUNCTION public.process_referral_reward(registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- GUARD: Registration must actually be completed
  IF reg.status != 'completed' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Registration not completed yet');
  END IF;

  referred_user_id := reg.user_id;

  -- Find the referral record WITH ROW LOCK (prevents race condition)
  SELECT * INTO referral_record
  FROM referrals
  WHERE referred_id = referred_user_id
    AND status IN ('registered', 'purchase_completed', 'reward_granted')
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF referral_record.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'No valid referral found');
  END IF;

  -- Idempotency guard: already rewarded
  IF referral_record.status = 'reward_granted' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Reward already granted');
  END IF;

  referrer_id_var := referral_record.referrer_id;

  -- Get referrer profile
  SELECT * INTO referrer_profile FROM profiles WHERE id = referrer_id_var;

  -- FRAUD CHECK 1: Self-referral
  IF referrer_id_var = referred_user_id THEN
    fraud_reasons := array_append(fraud_reasons, 'self_referral');
  END IF;

  -- FRAUD CHECK 2: Same phone number
  IF referrer_profile.phone IS NOT NULL AND reg.phone IS NOT NULL
     AND referrer_profile.phone = reg.phone THEN
    fraud_reasons := array_append(fraud_reasons, 'same_phone');
  END IF;

  -- FRAUD CHECK 3: Same email
  IF referrer_profile.email IS NOT NULL AND reg.email IS NOT NULL
     AND LOWER(referrer_profile.email) = LOWER(reg.email) THEN
    fraud_reasons := array_append(fraud_reasons, 'same_email');
  END IF;

  -- FRAUD CHECK 4: Same device fingerprint
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

  -- FRAUD CHECK 5: Multiple accounts (same phone/email across different users)
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

  -- DAILY LIMIT CHECK
  -- B1: value is jsonb and this row is the JSON string "50; value::INT
  -- raised 22023 here, which aborted every reward grant.
  SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+$'
              THEN (value #>> '{}')::INT END
    INTO max_daily FROM app_settings WHERE key = 'referral_max_daily';
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

  -- GRANT REWARD (atomic)
  -- B1: same jsonb-string problem for the reward amount ("1").
  SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (value #>> '{}')::NUMERIC END
    INTO reward_amt FROM app_settings WHERE key = 'referral_reward_amount';
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
$function$;



CREATE OR REPLACE FUNCTION public.apply_for_agent()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  current_role user_role;
  current_balance DECIMAL(12,2);
  agent_fee_amt DECIMAL(12,2);
  existing_app RECORD;
  auto_approve TEXT;
  new_agent_id TEXT;
BEGIN
  -- Get current user info
  SELECT role, wallet_balance INTO current_role, current_balance
  FROM profiles WHERE id = current_user_id;

  -- Check if already an agent
  IF current_role = 'agent' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'You are already an agent');
  END IF;

  -- Check for existing pending application
  SELECT * INTO existing_app FROM agent_applications
  WHERE user_id = current_user_id AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF existing_app.id IS NOT NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'You already have a pending application', 'application_id', existing_app.id);
  END IF;

  -- Get agent fee from settings
  -- B1 class: agent_fee is the jsonb string "50; value::DECIMAL raised 22023.
  SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (value #>> '{}')::DECIMAL END
    INTO agent_fee_amt
  FROM app_settings WHERE key = 'agent_fee';
  IF agent_fee_amt IS NULL THEN agent_fee_amt := 100; END IF;

  -- Check wallet balance
  IF current_balance < agent_fee_amt THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Insufficient wallet balance. Required: GHS ' || agent_fee_amt || ', Available: GHS ' || current_balance);
  END IF;

  -- Create application
  INSERT INTO agent_applications (user_id, payment_status, amount_paid, status)
  VALUES (current_user_id, 'paid', agent_fee_amt, 'pending')
  RETURNING id INTO existing_app;

  -- Debit wallet
  PERFORM debit_wallet(current_user_id, agent_fee_amt, 'Agent registration fee');

  -- Auto-approve if setting enabled
  -- B2 class: jsonb boolean/quoted string never equals 'true' through ::TEXT.
  SELECT value #>> '{}' INTO auto_approve FROM app_settings WHERE key = 'agent_auto_approve';
  IF lower(COALESCE(auto_approve, '')) = 'true' THEN
    new_agent_id := generate_agent_id();
    UPDATE profiles
    SET role = 'agent', agent_since = NOW(), agent_status = 'active',
        agent_verified = true, agent_id = new_agent_id
    WHERE id = current_user_id;

    UPDATE agent_applications SET status = 'approved' WHERE id = existing_app.id;

    -- Create notification
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (current_user_id, 'Agent Application Approved',
            'Congratulations! Your agent account has been approved. Your Agent ID is ' || new_agent_id || '.', 'success');

    RETURN JSONB_BUILD_OBJECT(
      'success', true, 'auto_approved', true,
      'agent_id', new_agent_id, 'application_id', existing_app.id
    );
  END IF;

  -- Create notification for pending approval
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (current_user_id, 'Agent Application Submitted',
          'Your agent application has been submitted successfully. Waiting for admin approval.', 'info');

  RETURN JSONB_BUILD_OBJECT(
    'success', true, 'auto_approved', false,
    'application_id', existing_app.id,
    'message', 'Application submitted. Waiting for admin approval.'
  );
END;
$function$;



CREATE OR REPLACE FUNCTION public.admin_retry_referral_reward(p_referral_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  referrer_id_var UUID;
  referred_user_id UUID;
  referral_record RECORD;
  reg RECORD;
  reward_amt NUMERIC(12,2);
  daily_count INT;
  max_daily INT;
  fraud_reasons TEXT[] := '{}';
  dup_count INT;
  referrer_profile RECORD;
BEGIN
  -- Only admins can call this
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get the referral record
  SELECT * INTO referral_record FROM referrals WHERE id = p_referral_id;
  IF referral_record.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Referral not found');
  END IF;

  -- Only allow retry for referrals in non-terminal states (not rejected, not already granted)
  IF referral_record.status NOT IN ('registered', 'purchase_completed', 'pending') THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Referral is in terminal state: ' || referral_record.status);
  END IF;

  -- Find the completed registration for this referred user
  referred_user_id := referral_record.referred_id;
  SELECT * INTO reg FROM registrations
  WHERE user_id = referred_user_id AND status = 'completed'
  ORDER BY created_at DESC LIMIT 1;

  IF reg.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'No completed registration found for this referred user');
  END IF;

  referrer_id_var := referral_record.referrer_id;

  -- Get referrer profile
  SELECT * INTO referrer_profile FROM profiles WHERE id = referrer_id_var;

  -- FRAUD CHECK 1: Self-referral
  IF referrer_id_var = referred_user_id THEN
    fraud_reasons := array_append(fraud_reasons, 'self_referral');
  END IF;

  -- FRAUD CHECK 2: Same phone
  IF referrer_profile.phone IS NOT NULL AND reg.phone IS NOT NULL
     AND referrer_profile.phone = reg.phone THEN
    fraud_reasons := array_append(fraud_reasons, 'same_phone');
  END IF;

  -- FRAUD CHECK 3: Same email
  IF referrer_profile.email IS NOT NULL AND reg.email IS NOT NULL
     AND LOWER(referrer_profile.email) = LOWER(reg.email) THEN
    fraud_reasons := array_append(fraud_reasons, 'same_email');
  END IF;

  -- FRAUD CHECK 4: Device fingerprint
  IF reg.device_fingerprint IS NOT NULL AND LENGTH(reg.device_fingerprint) > 0 THEN
    SELECT COUNT(*) INTO dup_count
    FROM registrations r2
    JOIN referrals ref2 ON ref2.referred_id = r2.user_id
    WHERE r2.device_fingerprint = reg.device_fingerprint
      AND ref2.referrer_id = referrer_id_var
      AND r2.id != reg.id;
    IF dup_count > 0 THEN
      fraud_reasons := array_append(fraud_reasons, 'same_device');
    END IF;
  END IF;

  -- If fraud detected
  IF array_length(fraud_reasons, 1) > 0 THEN
    UPDATE referrals SET status = 'rejected', fraud_check_passed = false,
      fraud_note = array_to_string(fraud_reasons, ', ')
    WHERE id = referral_record.id;
    INSERT INTO referral_fraud_log (referral_id, detected_by, details)
    VALUES (referral_record.id, 'admin_retry', JSONB_BUILD_OBJECT('reasons', to_jsonb(fraud_reasons)));
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Fraud detected', 'reasons', to_jsonb(fraud_reasons));
  END IF;

  -- Daily limit check
  -- B1: jsonb string "50" is not castable with value::INT.
  SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+$'
              THEN (value #>> '{}')::INT END
    INTO max_daily FROM app_settings WHERE key = 'referral_max_daily';
  IF max_daily IS NULL THEN max_daily := 50; END IF;
  SELECT COUNT(*) INTO daily_count FROM referral_rewards
  WHERE user_id = referrer_id_var AND created_at >= CURRENT_DATE AND status = 'paid';
  IF daily_count >= max_daily THEN
    UPDATE referrals SET status = 'rejected', fraud_check_passed = false, fraud_note = 'Daily reward limit reached'
    WHERE id = referral_record.id;
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Daily reward limit reached');
  END IF;

  -- Grant reward (atomic)
  -- B1: jsonb string "1" is not castable with value::NUMERIC.
  SELECT CASE WHEN (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (value #>> '{}')::NUMERIC END
    INTO reward_amt FROM app_settings WHERE key = 'referral_reward_amount';
  IF reward_amt IS NULL THEN reward_amt := 1; END IF;

  UPDATE referrals SET status = 'reward_granted', reward_amount = reward_amt,
    order_id = reg.id, fraud_check_passed = true, completed_at = NOW()
  WHERE id = referral_record.id;
  INSERT INTO referral_rewards (referral_id, user_id, amount, status, paid_at)
  VALUES (referral_record.id, referrer_id_var, reward_amt, 'paid', NOW());
  UPDATE profiles SET wallet_balance = wallet_balance + reward_amt WHERE id = referrer_id_var;
  INSERT INTO wallet_transactions (user_id, type, amount, description, reference, status)
  VALUES (referrer_id_var, 'credit', reward_amt, 'Referral reward (admin retry)', 'REF-' || referral_record.id, 'completed');

  RETURN JSONB_BUILD_OBJECT('success', true, 'referrer_id', referrer_id_var, 'amount', reward_amt, 'referral_id', referral_record.id);
END;
$function$;

