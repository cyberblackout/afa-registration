CREATE OR REPLACE FUNCTION admin_soft_delete_user(
  p_caller_id UUID,
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_email TEXT;
  v_target_role TEXT;
  v_wallet_balance NUMERIC;
  v_target_referral_code TEXT;
  v_target_username TEXT;
BEGIN
  -- 1. Caller authorization check
  SELECT role INTO v_caller_role FROM profiles WHERE id = p_caller_id;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  -- 2. Self-deletion check
  IF p_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- 3. Target must not be admin
  SELECT role, email, wallet_balance, referral_code, username
  INTO v_target_role, v_target_email, v_wallet_balance, v_target_referral_code, v_target_username
  FROM profiles WHERE id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot delete admin accounts';
  END IF;

  -- 4. Pre-deletion audit snapshot
  INSERT INTO deleted_users_audit (target_user_id, target_email, target_role, wallet_balance, referral_code, deleted_by, reason)
  VALUES (p_target_user_id, v_target_email, v_target_role, v_wallet_balance, v_target_referral_code, p_caller_id, p_reason);

  -- 5. PII anonymization + profile reset
  UPDATE profiles SET
    full_name = '[Deleted User]',
    email = 'deleted-' || LEFT(p_target_user_id::text, 8) || '@removed.invalid',
    phone = '0000000000',
    avatar_url = NULL,
    address = NULL,
    registration_number = NULL,
    username = 'del_' || LEFT(p_target_user_id::text, 8),
    referral_code = 'DEL_' || LEFT(p_target_user_id::text, 8),
    wallet_balance = 0,
    role = 'user',
    agent_since = NULL,
    agent_status = NULL,
    agent_verified = false,
    agent_id = NULL,
    deleted_at = now(),
    notification_preferences = '{}'::jsonb
  WHERE id = p_target_user_id;

  -- 6. Audit log entry
  INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (
    p_caller_id,
    'admin_soft_delete_user',
    'profile',
    p_target_user_id::text,
    jsonb_build_object(
      'email', v_target_email,
      'role', v_target_role,
      'wallet_balance', v_wallet_balance,
      'referral_code', v_target_referral_code
    ),
    jsonb_build_object(
      'anonymized', true,
      'reason', p_reason,
      'wallet_balance_zeroed', true
    )
  );

  -- 7. Delete ephemeral data
  DELETE FROM notifications WHERE user_id = p_target_user_id;
  DELETE FROM push_subscriptions WHERE user_id = p_target_user_id;

  RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id);
END;
$$;

-- Lock down EXECUTE (consistent with admin_set_user_role pattern)
REVOKE EXECUTE ON FUNCTION admin_soft_delete_user(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_soft_delete_user(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_soft_delete_user(UUID, UUID, TEXT) FROM authenticated;
