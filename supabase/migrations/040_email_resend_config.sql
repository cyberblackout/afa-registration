-- ============================================================
-- Migration 040: email (Resend) configuration storage
-- ============================================================
-- The two live email senders (send-email, admin-registrations)
-- read resend_api_key + email_from from system_settings, but the
-- Settings UI wrote them to app_settings. This migration:
--   1. Seeds the NON-secret email keys into system_settings with
--      safe defaults (idempotent).
--   2. Does NOT seed resend_api_key (write-only secret, set only
--      via the admin-only save_email_config action).
--   3. Re-asserts admin-only RLS on system_settings and revokes
--      every grant to anon/authenticated so the key can never be
--      read through PostgREST (verified live in Phase 0: a normal
--      user JWT reads 0 rows).
--   4. Deletes any legacy smtp_* rows if they somehow exist (the
--      audit found only comments, never rows, but be defensive).
-- ============================================================

-- 1. Seed non-secret email keys (idempotent; setting_value is TEXT)
INSERT INTO public.system_settings (setting_name, setting_value)
VALUES
  ('email_enabled', 'false'),
  ('email_from', 'no-reply@afaregister.com'),
  ('email_from_name', 'MTN AFA Portal'),
  ('email_reply_to', 'support@afaregister.com')
ON CONFLICT (setting_name) DO NOTHING;

-- 2. Remove dead SMTP rows (none expected; defensive)
DELETE FROM public.system_settings
WHERE setting_name IN (
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
  'smtp_sender_name', 'smtp_from', 'smtp_enabled'
);

-- 3. Re-assert admin-only RLS (policies already exist and are
--    correct; DROP+CREATE makes this migration self-contained and
--    idempotent). Both policies require an admin profile.
DROP POLICY IF EXISTS "Admins can manage system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_only" ON public.system_settings;

CREATE POLICY "Admins can manage system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4. No grants to anon/authenticated; service_role only.
--    (system_settings is not exposed to PostgREST for these roles.)
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;
