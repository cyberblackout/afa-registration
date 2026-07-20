CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_name TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system_settings"
  ON system_settings FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "Authenticated users can read system_settings"
  ON system_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();

INSERT INTO system_settings (setting_name, setting_value) VALUES
  ('whatsapp_user_number', '233501112222'),
  ('whatsapp_agent_number', '233501112222'),
  ('whatsapp_user_message', 'Hello, I need help with my account.'),
  ('whatsapp_agent_message', 'Hello, I am an agent and I need assistance.'),
  ('whatsapp_enabled', 'true')
ON CONFLICT (setting_name) DO NOTHING;
