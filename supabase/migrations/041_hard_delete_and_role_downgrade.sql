-- Migration: 041_hard_delete_and_role_downgrade.sql
-- 1. admin_hard_delete_user: replaces the soft-delete/anonymization flow with a
--    true hard-delete pipeline. The RPC snapshots the target into
--    deleted_users_audit, writes an audit_logs entry, and purges ephemeral data
--    (notifications, push_subscriptions). The Edge Function then calls
--    supabase.auth.admin.deleteUser() which removes auth.users; the FK chain
--    (profiles -> auth.users ON DELETE CASCADE, orders/wallet_transactions ->
--    profiles ON DELETE CASCADE) purges all linked rows cleanly.
-- 2. admin_set_user_role: re-created to allow bi-directional role switching
--    (ADMIN <-> USER <-> AGENT). The "admin role is permanent" block is removed;
--    the last-admin guard becomes live so the final admin can never be demoted.
--    The self-change ban is preserved (an active admin cannot revoke their own
--    admin access).

-- ------------------------------------------------------------
-- 1. Hard-delete preparation RPC (SECURITY DEFINER, service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(
  p_caller_id UUID,
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
  v_target_email TEXT;
  v_target_name TEXT;
  v_wallet_balance NUMERIC;
  v_target_referral_code TEXT;
  v_target_username TEXT;
BEGIN
  -- 1. Caller must be authenticated (Edge Function passes verified ID)
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Session binding: reject spoofed caller IDs from non-service-role requests
  IF p_caller_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Unauthorized: caller mismatch';
  END IF;

  -- 3. Read caller role server-side (never trusted from client)
  SELECT role INTO v_caller_role FROM profiles WHERE id = p_caller_id;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  -- 4. Self-deletion check
  IF p_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- 5. Load target profile
  SELECT role, email, full_name, wallet_balance, referral_code, username
  INTO v_target_role, v_target_email, v_target_name, v_wallet_balance, v_target_referral_code, v_target_username
  FROM profiles WHERE id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot delete admin accounts';
  END IF;

  -- 6. Pre-deletion audit snapshot (survives the cascade purge)
  INSERT INTO deleted_users_audit (
    target_user_id, target_email, target_role, wallet_balance, referral_code, deleted_by, reason
  ) VALUES (
    p_target_user_id, v_target_email, v_target_role, v_wallet_balance, v_target_referral_code, p_caller_id, p_reason
  );

  -- 7. Audit log entry
  INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
  VALUES (
    p_caller_id,
    'admin_hard_delete_user',
    'profile',
    p_target_user_id::text,
    jsonb_build_object(
      'email', v_target_email,
      'full_name', v_target_name,
      'role', v_target_role,
      'wallet_balance', v_wallet_balance,
      'referral_code', v_target_referral_code,
      'username', v_target_username
    ),
    jsonb_build_object('hard_deleted', true, 'reason', p_reason),
    now()
  );

  -- 8. Purge ephemeral data that is not covered by an ON DELETE CASCADE
  DELETE FROM notifications WHERE user_id = p_target_user_id;
  DELETE FROM push_subscriptions WHERE user_id = p_target_user_id;

  -- NOTE: profiles/orders/wallet_transactions are purged by the FK cascade
  -- when the Edge Function removes the auth.users row via the Admin API.
  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'prepared', true
  );
END;
$$;

-- Lock down EXECUTE (service_role only; Edge Functions use service_role)
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID, UUID, TEXT) FROM authenticated;

-- ------------------------------------------------------------
-- 2. Re-create admin_set_user_role with bi-directional role switching
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_caller_id UUID,
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_current_role TEXT;
  v_target_name TEXT;
  v_admin_count BIGINT;
BEGIN
  -- 1. Caller must be authenticated (Edge Function passes verified ID)
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Session binding: reject spoofed caller IDs from non-service-role requests
  IF p_caller_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Unauthorized: caller mismatch';
  END IF;

  -- 3. Read caller's role from profiles (server-side, never trusted from client)
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = p_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  -- 4. Validate the new_role enum value
  IF p_new_role NOT IN ('user', 'agent', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %. Allowed values are user, agent, admin', p_new_role;
  END IF;

  -- 5. Read target user's current role and name
  SELECT role, full_name INTO v_current_role, v_target_name
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 6. Self-demotion prevention: an active admin cannot change their own role
  IF p_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- 7. No-op check: skip if role is already the target value
  IF v_current_role = p_new_role THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Role is already ' || p_new_role,
      'old_role', v_current_role,
      'new_role', p_new_role
    );
  END IF;

  -- 8. Zero-admin prevention: never demote the last remaining admin.
  --    (Admin -> user/agent is now allowed; only the final admin is protected.)
  IF v_current_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count
    FROM profiles
    WHERE role = 'admin' AND id != p_target_user_id
      AND deleted_at IS NULL;

    IF v_admin_count < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last admin account';
    END IF;
  END IF;

  -- 9. Perform the role update (bi-directional: user <-> agent <-> admin)
  UPDATE profiles
  SET role = p_new_role::user_role
  WHERE id = p_target_user_id;

  -- 10. Audit log: immutable record of the change
  INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
  VALUES (
    p_caller_id,
    'role_change',
    'profile',
    p_target_user_id::text,
    jsonb_build_object('role', v_current_role),
    jsonb_build_object('role', p_new_role),
    now()
  );

  -- 11. Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role updated from ' || v_current_role || ' to ' || p_new_role,
    'old_role', v_current_role,
    'new_role', p_new_role,
    'target_name', v_target_name
  );
END;
$$;

-- Grant EXECUTE to service_role only (Edge Functions use service_role)
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, UUID, TEXT) TO service_role;

-- Revoke from anon and authenticated (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, UUID, TEXT) FROM authenticated;
