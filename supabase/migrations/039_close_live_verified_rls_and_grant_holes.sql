-- ============================================================
-- Migration 039: close live-verified holes
-- Phase A audit, evidence gathered 2026-10-09 against production
-- via the Management API read-only query endpoint.
--
-- Everything below was confirmed LIVE before this file was
-- written; each fix is idempotent (IF EXISTS / CREATE OR
-- REPLACE) so it is safe to re-run.
--
-- P1  system_settings open read
--     007 created "Authenticated users can read system_settings".
--     009 dropped two policy names that never existed
--       ("system_settings_select_auth", "..._authenticated"),
--     so the open read survived. Policies OR together, so any
--     authenticated user could SELECT all rows.
--
-- P2  audit_logs open INSERT
--     006 dropped "System insert audit logs" and immediately
--     re-created it WITH CHECK (true) with no TO clause. 009
--     dropped a different name ("audit_logs_insert_policy") and
--     added the admin-only policy, but the open one survived.
--     Live roles = [public] => anon could INSERT (log forging).
--
-- P3  role_change_logs open INSERT
--     Same pattern: "System insert role change logs"
--     WITH CHECK (true), roles = [public]. Not in the original
--     audit report; found by the live pg_policies dump.
--
-- R1  Grant drift on six RPCs
--     010's REVOKEs target the signatures as they existed then.
--     The functions were later re-created with new parameters
--     (migrations 022-024 exist only in the live DB), Supabase
--     default privileges re-granted EXECUTE, and
--     has_function_privilege('anon', ..., 'EXECUTE') returned
--     true for all six below. Zero-side-effect PoCs as anon:
--       - bulk_update_registration_status([], ...) ->
--         {"count":0,"success":true}. The function has NO
--         internal auth check whatsoever: anyone could have
--         passed real UUIDs and set any registration's status.
--       - admin_get_agent_applications(<admin uuid>) ->
--         returned 5 agent applications with full PII. The
--         role check reads the CALLER-SUPPLIED p_caller_id and
--         never compares it to auth.uid(). Admin UUIDs are
--         readable by any user from their own
--         registration_timeline.changed_by rows (33 live).
--       - get_total_revenue(null, null) -> returned 61.00.
--
-- R2  Session binding for the three agent-admin RPCs
--     Even with the revokes, the p_caller_id pattern stays
--     spoofable if EXECUTE is ever re-granted by a future
--     migration. The bodies below now reject any PostgREST
--     request whose JWT role is not service_role when
--     p_caller_id <> auth.uid(). Direct SQL sessions (no
--     request.jwt.claims, e.g. the dashboard SQL editor) keep
--     the original behaviour.
--
-- Why this cannot break the app (grep-verified):
--   * src/ references NONE of the six RPCs.
--   * supabase/functions/admin-agents calls the three agent
--     RPCs through getSupabaseAdmin() (service_role), which
--     keeps EXECUTE in every statement below.
--   * The frontend reads system_settings via the admin-config
--     edge function (api.ts:430), not via PostgREST, so the
--     dropped SELECT policy has no consumer to break.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the three open policies (idempotent)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read system_settings"
  ON public.system_settings;

DROP POLICY IF EXISTS "System insert audit logs"
  ON public.audit_logs;

DROP POLICY IF EXISTS "System insert role change logs"
  ON public.role_change_logs;

-- ------------------------------------------------------------
-- 2. Revoke PostgREST access on the six proven/zero-caller RPCs
--    Live signatures (NOT the pre-022 signatures from 010).
--    service_role keeps EXECUTE for the edge functions.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_get_agent_applications(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_agent_application(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_agent_status(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_update_registration_status(uuid[], text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_total_revenue(timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_registration_stats()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_agent_applications(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_agent_application(uuid, text, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_agent_status(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_registration_status(uuid[], text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_total_revenue(timestamp with time zone, timestamp with time zone)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_registration_stats()
  TO service_role;

-- ------------------------------------------------------------
-- 3. Session binding (R2) on the three agent-admin RPCs.
--    Bodies captured verbatim from pg_get_functiondef on
--    2026-10-09, plus the caller-binding guard. The guard is
--    inserted right after the existing NULL check.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_agent_applications(p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  caller_role TEXT;
  apps_result JSONB;
  agents_result JSONB;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Caller ID required');
  END IF;

  IF p_caller_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Unauthorized: caller mismatch');
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = p_caller_id;
  IF caller_role IS NULL OR caller_role != 'admin' THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Unauthorized: admin role required');
  END IF;

  -- Applications
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', a.id,
      'user_id', a.user_id,
      'user_name', p.full_name,
      'user_email', p.email,
      'user_phone', p.phone,
      'payment_status', a.payment_status,
      'amount_paid', a.amount_paid,
      'payment_reference', a.payment_reference,
      'status', a.status,
      'admin_notes', a.admin_notes,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    ) ORDER BY a.created_at DESC
  ) INTO apps_result
  FROM agent_applications a
  JOIN profiles p ON p.id = a.user_id;

  -- Agents (active profiles with role = 'agent')
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', pr.id,
      'agent_id', pr.agent_id,
      'full_name', pr.full_name,
      'email', pr.email,
      'phone', pr.phone,
      'agent_status', pr.agent_status,
      'agent_verified', pr.agent_verified,
      'agent_since', pr.agent_since,
      'registrations_count', COALESCE(reg.cnt, 0),
      'earnings', COALESCE(earn.total, 0)
    ) ORDER BY pr.agent_since DESC
  ) INTO agents_result
  FROM profiles pr
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM registrations WHERE user_id = pr.id
  ) reg ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount), 0) AS total FROM agent_transactions
    WHERE agent_id = pr.id AND type IN ('commission', 'bonus') AND status = 'completed'
  ) earn ON true
  WHERE pr.role = 'agent';

  RETURN JSONB_BUILD_OBJECT(
    'applications', COALESCE(apps_result, '[]'::JSONB),
    'agents', COALESCE(agents_result, '[]'::JSONB)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_agent_application(p_application_id uuid, p_status text, p_admin_notes text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  app RECORD;
  caller_role TEXT;
  new_agent_id TEXT;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Caller ID required');
  END IF;

  IF p_caller_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Unauthorized: caller mismatch');
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = p_caller_id;
  IF caller_role IS NULL OR caller_role != 'admin' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Unauthorized: admin role required');
  END IF;

  SELECT * INTO app FROM agent_applications WHERE id = p_application_id;
  IF app.id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Application not found');
  END IF;

  -- IDEMPOTENCY: already in target state -> success without changes
  IF p_status = 'approved' AND app.status = 'approved' THEN
    RETURN JSONB_BUILD_OBJECT('success', true, 'status', 'approved', 'agent_id', (SELECT agent_id FROM profiles WHERE id = app.user_id), 'message', 'Already approved');
  ELSIF p_status = 'rejected' AND app.status = 'rejected' THEN
    RETURN JSONB_BUILD_OBJECT('success', true, 'status', 'rejected', 'message', 'Already rejected');
  END IF;

  -- Guard: Cannot approve/reject already-processed applications
  IF app.status IN ('approved', 'rejected') THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Application has already been processed');
  END IF;

  IF p_status = 'approved' THEN
    new_agent_id := generate_agent_id();
    UPDATE profiles
    SET role = 'agent', agent_since = NOW(), agent_status = 'active',
        agent_verified = true, agent_id = new_agent_id
    WHERE id = app.user_id;

    UPDATE agent_applications
    SET status = 'approved', admin_id = p_caller_id, admin_notes = p_admin_notes
    WHERE id = p_application_id;

    INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
    VALUES (p_caller_id, 'agent_approval', 'agent_application', p_application_id::text,
            jsonb_build_object('status', app.status),
            jsonb_build_object('status', 'approved', 'agent_id', new_agent_id),
            NOW());

    INSERT INTO notifications (user_id, title, message, type)
    VALUES (app.user_id, 'Agent Application Approved',
            'Congratulations! Your agent account has been approved. Your Agent ID is ' || new_agent_id || '.', 'success');

    RETURN JSONB_BUILD_OBJECT('success', true, 'status', 'approved', 'agent_id', new_agent_id);
  ELSIF p_status = 'rejected' THEN
    UPDATE agent_applications
    SET status = 'rejected', admin_id = p_caller_id, admin_notes = p_admin_notes
    WHERE id = p_application_id;

    PERFORM credit_wallet(app.user_id, app.amount_paid, 'Refund for rejected agent application', 'REF-AGENT-' || app.id);

    INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
    VALUES (p_caller_id, 'agent_rejection', 'agent_application', p_application_id::text,
            jsonb_build_object('status', app.status),
            jsonb_build_object('status', 'rejected'),
            NOW());

    INSERT INTO notifications (user_id, title, message, type)
    VALUES (app.user_id, 'Agent Application Rejected',
            'Your agent application has been rejected. ' || COALESCE(p_admin_notes, 'Please contact support for more information.'), 'error');

    RETURN JSONB_BUILD_OBJECT('success', true, 'status', 'rejected', 'refunded', true);
  ELSE
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Invalid status. Use "approved" or "rejected".');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_toggle_agent_status(p_user_id uuid, p_status text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  caller_role TEXT;
  affected_rows INT;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Caller ID required');
  END IF;

  IF p_caller_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Unauthorized: caller mismatch');
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = p_caller_id;
  IF caller_role IS NULL OR caller_role != 'admin' THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Unauthorized: admin role required');
  END IF;

  IF p_status NOT IN ('active', 'suspended') THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Invalid status. Use "active" or "suspended".');
  END IF;

  UPDATE profiles SET agent_status = p_status WHERE id = p_user_id AND role = 'agent';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'User is not an active agent');
  END IF;

  INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, created_at)
  VALUES (p_caller_id, 'agent_status_toggle', 'profile', p_user_id::text,
          jsonb_build_object('agent_status', CASE WHEN p_status = 'suspended' THEN 'active' ELSE 'suspended' END),
          jsonb_build_object('agent_status', p_status),
          NOW());

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (p_user_id, 'Agent Account ' || INITCAP(p_status),
          CASE WHEN p_status = 'suspended' THEN 'Your agent account has been suspended. Please contact support.'
               ELSE 'Your agent account has been reactivated.' END,
          CASE WHEN p_status = 'suspended' THEN 'warning' ELSE 'success' END);

  RETURN JSONB_BUILD_OBJECT('success', true, 'status', p_status);
END;
$function$;

-- ------------------------------------------------------------
-- 4. Still-open, lower-severity items logged for the next pass
--    (left untouched here because the frontend may call them):
--      - get_paystack_config / get_my_profile / is_admin /
--        check_permission / get_agent_* / apply_for_agent /
--        assign_reg_number / cleanup_rate_limits /
--        generate_agent_id / handle_new_user / log_admin_action /
--        log_role_change / sync_registration_to_order_status /
--        get_user_role remain anon+authenticated executable.
--      - 24 functions lack a pinned search_path (advisor WARN).
--      - auth leaked-password protection still disabled
--        (dashboard setting, not SQL).
-- ------------------------------------------------------------
