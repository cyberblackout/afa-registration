-- Migration: 021_admin_set_user_role_rpc.sql
-- Creates the admin_set_user_role SECURITY DEFINER RPC function.
-- This is the single, hardened role-change function with all safeguards:
--   1. Caller must be admin (verified server-side from profiles.role)
--   2. Self-demotion prevention
--   3. Zero-admin prevention (defense-in-depth)
--   4. Enum validation
--   5. Approved transition matrix enforcement
--   6. Audit logging

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- Restrict to service_role only (Edge Functions use service_role)
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_current_role TEXT;
  v_target_name TEXT;
  v_admin_count BIGINT;
  v_result JSONB;
BEGIN
  -- 1. Verify caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Read caller's role from profiles (server-side, never trusted from client)
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  -- 3. Validate the new_role enum value
  IF p_new_role NOT IN ('user', 'agent', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %. Allowed values are user, agent, admin', p_new_role;
  END IF;

  -- 4. Read target user's current role and name
  SELECT role, full_name INTO v_current_role, v_target_name
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 5. Self-demotion prevention: admin cannot change their own role
  IF v_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- 6. Transition matrix enforcement: admin role is permanent
  IF v_current_role = 'admin' AND p_new_role != 'admin' THEN
    RAISE EXCEPTION 'Admin role cannot be removed. Admin accounts are permanent.';
  END IF;

  -- 7. Zero-admin prevention (defense-in-depth, currently unreachable given matrix)
  -- If somehow an admin-to-non-admin transition were allowed in the future,
  -- this check ensures at least one admin remains.
  IF v_current_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count
    FROM profiles
    WHERE role = 'admin' AND id != p_target_user_id;

    IF v_admin_count < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last admin account';
    END IF;
  END IF;

  -- 8. No-op check: skip if role is already the target value
  IF v_current_role = p_new_role THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Role is already ' || p_new_role,
      'old_role', v_current_role,
      'new_role', p_new_role
    );
  END IF;

  -- 9. Perform the role update
  UPDATE profiles
  SET role = p_new_role::user_role
  WHERE id = p_target_user_id;

  -- 10. Audit log: immutable record of the change
  INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
  VALUES (
    v_caller_id,
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
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO service_role;

-- Revoke from anon and authenticated (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM authenticated;
