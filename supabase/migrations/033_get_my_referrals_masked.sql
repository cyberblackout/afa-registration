-- ============================================================
-- 033 get_my_referrals_masked: PII masking + both directions (audit B7, B16)
--
-- B7  The referrals Edge Function returned the raw joined row
--     (referred_profile.email / phone in full) to every referrer, so any
--     user could harvest the phone number and e-mail address of the people
--     they invited. The hardened masked RPC existed in migration 019 but was
--     never wired up, and it read auth.uid() (useless when the Edge Function
--     calls it with the service role).
-- B16 The list only matched `referrer_id = caller`, so a user who joined
--     through someone else's code never saw that relationship at all. The
--     list now returns both directions with an explicit `direction` field;
--     the counterparty profile is always the masked person on the other
--     side of the referral.
--
-- Shape is backward compatible: `referred_profile` still carries
-- full_name/email/phone (masked), plus `direction` = outgoing|incoming.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_referrals_masked();
DROP FUNCTION IF EXISTS public.get_my_referrals_masked(uuid);

CREATE OR REPLACE FUNCTION public.get_my_referrals_masked(p_caller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'caller id required');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'referrer_id', r.referrer_id,
        'referred_id', r.referred_id,
        'referral_code', r.referral_code,
        'status', r.status,
        'reward_amount', r.reward_amount,
        'fraud_check_passed', r.fraud_check_passed,
        'fraud_note', r.fraud_note,
        'created_at', r.created_at,
        'completed_at', r.completed_at,
        'direction',
          CASE WHEN r.referrer_id = p_caller_id THEN 'outgoing' ELSE 'incoming' END,
        'referred_profile', jsonb_build_object(
          'full_name', cp.full_name,
          'email',
            CASE
              WHEN cp.email IS NULL OR position('@' in cp.email) = 0 THEN NULL
              ELSE left(cp.email, 1) || '***@' || split_part(cp.email, '@', 2)
            END,
          'phone',
            CASE
              WHEN cp.phone IS NULL OR length(cp.phone) < 6 THEN NULL
              ELSE left(cp.phone, 3) || ' **** ' || right(cp.phone, 3)
            END
        )
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM referrals r
  LEFT JOIN profiles cp
    ON cp.id = CASE
                 WHEN r.referrer_id = p_caller_id THEN r.referred_id
                 ELSE r.referrer_id
               END
  WHERE r.referrer_id = p_caller_id
     OR r.referred_id = p_caller_id;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_referrals_masked(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_referrals_masked(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_referrals_masked(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referrals_masked(uuid) TO service_role;
