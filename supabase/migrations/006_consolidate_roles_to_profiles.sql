-- 006_consolidate_roles_to_profiles
-- Moves role from user_roles table into profiles.role column.
-- Drops user_roles and app_role enum. Profiles.role is now the single source of truth.

-- Create new enum with only user/admin
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- Add role column to profiles
ALTER TABLE profiles ADD COLUMN role user_role NOT NULL DEFAULT 'user';

-- Migrate existing roles from user_roles to profiles
UPDATE profiles p
SET role = ur.role::text::user_role
FROM user_roles ur
WHERE ur.user_id = p.id
  AND ur.role IN ('user', 'admin');

-- Backfill any profiles without a user_roles row
UPDATE profiles SET role = 'user' WHERE role IS NULL;

-- Drop old trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Update handle_new_user to write role to profiles instead of user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update is_admin RPC to read from profiles.role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Drop old get_user_role, recreate with new return type
DROP FUNCTION IF EXISTS public.get_user_role(UUID);

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_role public.user_role;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
  RETURN COALESCE(user_role, 'user');
END;
$$;

-- Rewrite all RLS policies to use profiles.role instead of user_roles

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins update profiles" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (role = (SELECT role FROM profiles WHERE id = auth.uid())));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins update profiles"
  ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ORDERS
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
DROP POLICY IF EXISTS "Admins view all orders" ON orders;
DROP POLICY IF EXISTS "Admins update orders" ON orders;

CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all orders" ON orders FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins update orders" ON orders FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- WALLET TRANSACTIONS
DROP POLICY IF EXISTS "Users can view own transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Admins view all transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Admins insert transactions" ON wallet_transactions;

CREATE POLICY "Users can view own transactions" ON wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all transactions" ON wallet_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins insert transactions" ON wallet_transactions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- REGISTRATIONS
DROP POLICY IF EXISTS "Users view own registrations" ON registrations;
DROP POLICY IF EXISTS "Users insert own registrations" ON registrations;
DROP POLICY IF EXISTS "Admins view all registrations" ON registrations;
DROP POLICY IF EXISTS "Admins update registrations" ON registrations;

CREATE POLICY "Users view own registrations" ON registrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own registrations" ON registrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all registrations" ON registrations FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins update registrations" ON registrations FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- REGISTRATION DOCUMENTS
DROP POLICY IF EXISTS "Users view own docs" ON registration_documents;
DROP POLICY IF EXISTS "Admins manage docs" ON registration_documents;

CREATE POLICY "Users view own docs" ON registration_documents FOR SELECT USING (EXISTS (SELECT 1 FROM registrations WHERE id = registration_documents.registration_id AND user_id = auth.uid()));
CREATE POLICY "Admins manage docs" ON registration_documents FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- REGISTRATION TIMELINE
DROP POLICY IF EXISTS "Users view own timeline" ON registration_timeline;
DROP POLICY IF EXISTS "Users insert own timeline" ON registration_timeline;
DROP POLICY IF EXISTS "Admins view all timeline" ON registration_timeline;
DROP POLICY IF EXISTS "Admins insert timeline" ON registration_timeline;

CREATE POLICY "Users view own timeline" ON registration_timeline FOR SELECT USING (EXISTS (SELECT 1 FROM registrations WHERE id = registration_timeline.registration_id AND user_id = auth.uid()));
CREATE POLICY "Users insert own timeline" ON registration_timeline FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM registrations WHERE id = registration_timeline.registration_id AND user_id = auth.uid()));
CREATE POLICY "Admins view all timeline" ON registration_timeline FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins insert timeline" ON registration_timeline FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users manage own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins send notifications" ON notifications;

CREATE POLICY "Users manage own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins send notifications" ON notifications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- PRICING
DROP POLICY IF EXISTS "Users can view pricing" ON pricing;
DROP POLICY IF EXISTS "Admins manage pricing" ON pricing;

CREATE POLICY "Users can view pricing" ON pricing FOR SELECT USING (true);
CREATE POLICY "Admins manage pricing" ON pricing FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- APP SETTINGS
DROP POLICY IF EXISTS "Admins manage settings" ON app_settings;
CREATE POLICY "Admins manage settings" ON app_settings FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- AUDIT LOGS
DROP POLICY IF EXISTS "System insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Admins view audit logs" ON audit_logs;

CREATE POLICY "System insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view audit logs" ON audit_logs FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- PAYMENT CONFIG
DROP POLICY IF EXISTS "Admins manage payment config" ON payment_config;
CREATE POLICY "Admins manage payment config" ON payment_config FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- WHATSAPP CONFIG
DROP POLICY IF EXISTS "Admins manage whatsapp" ON whatsapp_config;
CREATE POLICY "Admins manage whatsapp" ON whatsapp_config FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ANNOUNCEMENTS
DROP POLICY IF EXISTS "Users view active announcements" ON announcements;
DROP POLICY IF EXISTS "Admins manage announcements" ON announcements;

CREATE POLICY "Users view active announcements" ON announcements FOR SELECT USING (active = true OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins manage announcements" ON announcements FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- SUPPORT TICKETS
DROP POLICY IF EXISTS "Users manage own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins manage all tickets" ON support_tickets;

CREATE POLICY "Users manage own tickets" ON support_tickets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all tickets" ON support_tickets FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Drop user_roles table and old app_role enum
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TYPE IF EXISTS public.app_role;
