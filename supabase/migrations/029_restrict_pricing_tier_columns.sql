-- Migration: 029_restrict_pricing_tier_columns.sql
-- Applied AFTER the frontend release (see deploy order): the previous bundle
-- still reads `pricing` with select('*'), so this must not go live first.
--
-- Why: `pricing` has RLS `FOR SELECT USING (true)`, so with the anon key any
-- unauthenticated caller could read `agent_price` directly over PostgREST and
-- learn the agent tier price without ever authenticating as an agent.
-- (Live-proven before this change: GET /rest/v1/pricing?select=key,agent_price
--  returned {"key":"afa_registration","agent_price":"12.00"} with anon only.)
--
-- Tier prices are now served exclusively by the authenticated
-- `get_afa_pricing` action, which returns only the caller's own tier.
-- The remaining columns stay public because wallet top-up limits, labels and
-- descriptions are read straight from this table by the wallet page.

REVOKE SELECT ON public.pricing FROM anon, authenticated;

GRANT SELECT (id, key, label, amount, type, category, active, updated_at)
  ON public.pricing TO anon, authenticated;

-- service_role (Edge Functions) is intentionally untouched: it keeps the
-- table-level SELECT it already has, so it can still resolve both tiers.
