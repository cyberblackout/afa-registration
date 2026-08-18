-- Add user_message column for user-facing notification content (separate from admin_notes which is internal-only)

ALTER TABLE registrations
ADD COLUMN user_message TEXT;
