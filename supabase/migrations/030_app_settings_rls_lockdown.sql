-- ============================================================
-- Migration 030: app_settings RLS lockdown + version control
--
-- Fixes B18 (confirmed in the referral audit):
--   Policy "Authenticated users can read app_settings" used
--   USING (true), so ANY logged-in user could read secret rows
--   such as sms_api_key, vapid_private_key, smtp_pass, smtp_user
--   straight from PostgREST.
--
-- The table itself had no creating migration in this repo
-- (schema drift), so it is first brought under version control
-- here, then locked down.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Version-control the table (idempotent — no-op when it
--    already exists, which it does in every live environment)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       jsonb NOT NULL,
  category    text DEFAULT 'general',
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_category
  ON public.app_settings (category);

-- ────────────────────────────────────────────────────────────
-- 2. Enable RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3. Drop the blanket authenticated read (the B18 leak)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read app_settings"
  ON public.app_settings;

-- ────────────────────────────────────────────────────────────
-- 4. Replace it with a DEFAULT-DENY, explicit allow-list of
--    keys that the app is allowed to show to a non-admin.
--
--    Only keys the frontend actually reads directly from
--    PostgREST are listed (src/services/api.ts settingsApi):
--      agent_fee   — BecomeAgentPage (fee to become an agent)
--
--    Everything else (referral settings, smtp_*, sms_*,
--    vapid_private_key, …) is service-role only: the Edge
--    Functions that need them already use getSupabaseAdmin().
--
--    To expose a new key to the app, add it here deliberately.
--    Anything not listed stays invisible to non-admins.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users read public app_settings keys"
  ON public.app_settings;

CREATE POLICY "Authenticated users read public app_settings keys"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (
    key = ANY (ARRAY['agent_fee']::text[])
  );

-- ────────────────────────────────────────────────────────────
-- 5. Admin policy (kept, made explicit/with_check; unchanged
--    semantics — admins get full CRUD, everyone else does not)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;

CREATE POLICY "Admins manage settings"
  ON public.app_settings
  FOR ALL
  TO public
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 6. Defence in depth: table-level grants.
--    Non-admins never write app_settings directly — every admin
--    write path goes through the admin-settings Edge Function
--    (service role). anon gets nothing (it had no SELECT policy
--    anyway); authenticated keeps a row-filtered SELECT only.
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.app_settings FROM anon, authenticated;
GRANT SELECT ON TABLE public.app_settings TO authenticated;
