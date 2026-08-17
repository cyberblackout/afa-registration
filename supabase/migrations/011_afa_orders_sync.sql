-- Migration: 011_afa_orders_sync.sql
-- Adds source_type + source_id to orders so AFA registrations appear in the orders feed.

-- 1. Add columns for polymorphic source reference
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_id UUID;

-- 2. Extend status check to include 'document_verification' (used in registrations flow)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'document_verification'::text,
    'approved'::text,
    'completed'::text,
    'cancelled'::text,
    'failed'::text
  ]));

-- 3. RLS policies (defense-in-depth; Edge Functions use service_role which bypasses RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders
DROP POLICY IF EXISTS "Users can read own orders" ON orders;
CREATE POLICY "Users can read own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);
