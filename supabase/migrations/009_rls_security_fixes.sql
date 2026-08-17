-- Fix CRITICAL RLS vulnerabilities identified in Phase 0 audit

-- 1. CRITICAL: audit_logs INSERT was open to any authenticated user (CHECK true)
-- Only admins should be able to insert audit logs
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON audit_logs;
CREATE POLICY audit_logs_insert_admin_only ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. CRITICAL: role_change_logs INSERT was open to any authenticated user (CHECK true)
-- Only admins should be able to insert role change logs
DROP POLICY IF EXISTS "role_change_logs_insert_policy" ON role_change_logs;
CREATE POLICY role_change_logs_insert_admin_only ON role_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. HIGH: system_settings was readable by any authenticated user
-- Restrict to admin-only (Edge Functions will handle serving these values)
DROP POLICY IF EXISTS "system_settings_select_auth" ON system_settings;
DROP POLICY IF EXISTS "system_settings_select_authenticated" ON system_settings;
CREATE POLICY system_settings_admin_only ON system_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. MEDIUM: Make role_permissions readable by authenticated users (needed for UI)
-- but keep it restricted from anon
DROP POLICY IF EXISTS "role_permissions_select_auth" ON role_permissions;
CREATE POLICY role_permissions_select_authenticated ON role_permissions
  FOR SELECT
  TO authenticated
  USING (true);
