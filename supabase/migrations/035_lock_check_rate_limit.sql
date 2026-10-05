-- ============================================================
-- 035 lock check_rate_limit down to the service role (Phase 7)
--
-- check_rate_limit() is SECURITY DEFINER and writes to rate_limits, so it
-- still had PUBLIC EXECUTE: an unauthenticated caller could call
-- /rest/v1/rpc/check_rate_limit with any (key, action) pair and burn the
-- window for shared keys such as the SMS/e-mail/push senders, denying
-- service to the app itself. Every real caller is an Edge Function running
-- with the service role.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;
