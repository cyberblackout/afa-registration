-- Notifications infrastructure: delivery log for email, SMS, and push channels
-- Supports real provider tracking and marketing opt-in/opt-out enforcement

CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced')),
  provider_message_id TEXT,
  provider_response JSONB,
  is_marketing BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Index for querying by user and channel
CREATE INDEX IF NOT EXISTS idx_notifications_log_user_id ON notifications_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_channel ON notifications_log(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_log_status ON notifications_log(status);
CREATE INDEX IF NOT EXISTS idx_notifications_log_created_at ON notifications_log(created_at DESC);

-- RLS: users can read their own logs, admin can read all
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own notification logs
CREATE POLICY "Users read own notification logs"
  ON notifications_log FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can read all notification logs
CREATE POLICY "Admins read all notification logs"
  ON notifications_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Only service role (Edge Functions) can insert/update notification logs
-- No direct inserts from frontend
