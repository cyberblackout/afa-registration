-- Migration: 012_order_status_sync_trigger.sql
-- Adds 'rejected' to orders status CHECK constraint (parity with registrations)
-- Creates a trigger that syncs registration status → orders status automatically.

-- 1. Add 'rejected' to orders status CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'document_verification'::text,
    'approved'::text,
    'completed'::text,
    'rejected'::text,
    'cancelled'::text,
    'failed'::text
  ]));

-- 2. Create trigger function: when registrations.status changes, update the linked order
CREATE OR REPLACE FUNCTION sync_registration_to_order_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET status = NEW.status,
      updated_at = now()
  WHERE source_id = NEW.id
    AND source_type = 'afa_registration';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger on registrations table
DROP TRIGGER IF EXISTS trg_sync_registration_status ON registrations;
CREATE TRIGGER trg_sync_registration_status
  AFTER UPDATE OF status ON registrations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_registration_to_order_status();
