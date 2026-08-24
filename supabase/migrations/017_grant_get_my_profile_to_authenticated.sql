-- 017_grant_get_my_profile_to_authenticated.sql
-- Fix: get_my_profile() was revoked from anon in migration 010
-- but never explicitly granted to the authenticated role.
-- The client calls supabase.rpc('get_my_profile') using the user's JWT
-- (authenticated role), so without this GRANT, the call silently fails
-- returning empty data, which blocks auth initialization and causes
-- a blank screen on app load.

-- Grant EXECUTE to authenticated (client-side users with valid JWT)
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Ensure the function is also accessible to service_role (Edge Functions)
-- (Already granted in 010, but idempotent GRANT is safe)
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO service_role;
