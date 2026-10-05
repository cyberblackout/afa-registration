-- ============================================================
-- 037 wire up referral_fraud_protection, drop dead settings (Phase 9)
--
-- referral_fraud_protection is editable in the admin UI (Settings ->
-- Referral Program) but was read by nothing: the auto-rejection path in
-- process_referral_reward / admin_retry_referral_reward fired regardless of
-- the toggle. The toggle is now honoured: when it is off, findings are still
-- written to referral_fraud_log (so nothing is hidden) but the referral is
-- not rejected. Missing/malformed values default to ON.
--
-- referral_min_withdrawal and referral_rules are read by no code (there is
-- no withdrawal feature), and pricing.referral_bonus was only written by
-- admin-settings / rendered by the admin Fees tab - both are removed here
-- along with their UI/API writers in this same release.
-- ============================================================
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
  v_fraud_found BOOLEAN := FALSE;
  v_fraud_protected BOOLEAN := TRUE;
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

  -- Admin toggle (referral_fraud_protection). Missing or unrecognised
  -- values keep protection ON.
  SELECT CASE
           WHEN lower(value #>> '{}') IN ('true', '1', 'yes') THEN TRUE
           WHEN lower(value #>> '{}') IN ('false', '0', 'no') THEN FALSE
           ELSE NULL
         END
    INTO v_fraud_protected
  FROM app_settings
  WHERE key = 'referral_fraud_protection';
  IF v_fraud_protected IS NULL THEN v_fraud_protected := TRUE; END IF;

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
  v_fraud_found := array_length(fraud_reasons, 1) > 0;

  IF v_fraud_found THEN
    INSERT INTO referral_fraud_log (referral_id, detected_by, details)
    VALUES (referral_record.id, 'auto', JSONB_BUILD_OBJECT(
      'reasons', to_jsonb(fraud_reasons),
      'registration_phone', reg.phone,
      'registration_email', reg.email,
      'referrer_phone', referrer_profile.phone,
      'referrer_email', referrer_profile.email,
      'device_fingerprint', reg.device_fingerprint
    ));

    IF v_fraud_protected THEN
      UPDATE referrals
      SET status = 'rejected', fraud_check_passed = false,
          fraud_note = array_to_string(fraud_reasons, ', ')
      WHERE id = referral_record.id;

      RETURN JSONB_BUILD_OBJECT(
        'success', false, 'error', 'Fraud detected',
        'reasons', to_jsonb(fraud_reasons)
      );
    END IF;
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
      order_id = registration_id, fraud_check_passed = NOT v_fraud_found, completed_at = NOW()
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
  v_fraud_found BOOLEAN := FALSE;
  v_fraud_protected BOOLEAN := TRUE;
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

  -- Admin toggle (referral_fraud_protection). Missing or unrecognised
  -- values keep protection ON.
  SELECT CASE
           WHEN lower(value #>> '{}') IN ('true', '1', 'yes') THEN TRUE
           WHEN lower(value #>> '{}') IN ('false', '0', 'no') THEN FALSE
           ELSE NULL
         END
    INTO v_fraud_protected
  FROM app_settings
  WHERE key = 'referral_fraud_protection';
  IF v_fraud_protected IS NULL THEN v_fraud_protected := TRUE; END IF;

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
  v_fraud_found := array_length(fraud_reasons, 1) > 0;

  IF v_fraud_found THEN
    INSERT INTO referral_fraud_log (referral_id, detected_by, details)
    VALUES (referral_record.id, 'admin_retry', JSONB_BUILD_OBJECT('reasons', to_jsonb(fraud_reasons)));

    IF v_fraud_protected THEN
      UPDATE referrals SET status = 'rejected', fraud_check_passed = false,
        fraud_note = array_to_string(fraud_reasons, ', ')
      WHERE id = referral_record.id;
      RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Fraud detected', 'reasons', to_jsonb(fraud_reasons));
    END IF;
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
    order_id = reg.id, fraud_check_passed = NOT v_fraud_found, completed_at = NOW()
  WHERE id = referral_record.id;
  INSERT INTO referral_rewards (referral_id, user_id, amount, status, paid_at)
  VALUES (referral_record.id, referrer_id_var, reward_amt, 'paid', NOW());
  UPDATE profiles SET wallet_balance = wallet_balance + reward_amt WHERE id = referrer_id_var;
  INSERT INTO wallet_transactions (user_id, type, amount, description, reference, status)
  VALUES (referrer_id_var, 'credit', reward_amt, 'Referral reward (admin retry)', 'REF-' || referral_record.id, 'completed');

  RETURN JSONB_BUILD_OBJECT('success', true, 'referrer_id', referrer_id_var, 'amount', reward_amt, 'referral_id', referral_record.id);
END;
$function$;



-- Dead settings: no reader exists for any of these.
DELETE FROM app_settings WHERE key IN ('referral_min_withdrawal', 'referral_rules');
DELETE FROM pricing WHERE key = 'referral_bonus';
