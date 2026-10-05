-- ============================================================
-- 034 lock down money-moving RPCs (audit B14)
--
-- B14  process_referral_reward(uuid) still carried PUBLIC EXECUTE, so an
--      unauthenticated caller could POST /rest/v1/rpc/process_referral_reward
--      and receive a real result (the before-fix probe answered
--      {"error":"Registration not found"} with HTTP 200). Migration 010 only
--      revoked anon/authenticated, which does not remove the PUBLIC grant
--      those roles inherit, so the hole survived.
--
-- Same class, same fix: credit_wallet / debit_wallet / update_wallet_status
-- (wallet money) and the drifted admin_retry_referral_reward are public
-- executable today. All of their callers are Edge Functions using the
-- service role, or SECURITY DEFINER functions executing as their owner, so
-- nothing legitimate runs as anon/authenticated here.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.process_referral_reward(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_referral_reward(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_referral_reward(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_reward(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_retry_referral_reward(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_retry_referral_reward(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_retry_referral_reward(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_retry_referral_reward(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid, numeric, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_wallet_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_wallet_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_wallet_status(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_wallet_status(uuid, text) TO service_role;
