-- Add deleted_at column to profiles for soft delete support
ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;

-- Create audit table for pre-deletion snapshots
CREATE TABLE deleted_users_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  target_email TEXT,
  target_role TEXT,
  wallet_balance NUMERIC,
  referral_code TEXT,
  deleted_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

-- RLS: Admins can read, service_role writes via SECURITY DEFINER
ALTER TABLE deleted_users_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view deleted user audit"
  ON deleted_users_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
