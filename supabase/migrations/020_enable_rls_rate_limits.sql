-- Enable RLS on rate_limits table.
-- All legitimate access goes through check_rate_limit() SECURITY DEFINER function,
-- which bypasses RLS. No permissive policies for anon/authenticated are needed.
-- service_role bypasses RLS entirely. This locks down direct PostgREST access.

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Revoke direct table access from anon and authenticated roles.
-- The SECURITY DEFINER function check_rate_limit() owns its own access path.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Verify RLS is now enforced
DO $$
BEGIN
  ASSERT (
    SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'rate_limits'
  ) = true, 'RLS not enabled on rate_limits';
END $$;
