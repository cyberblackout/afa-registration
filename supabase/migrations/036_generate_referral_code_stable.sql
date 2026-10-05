-- ============================================================
-- 036 generate_referral_code must not rotate an existing code (Phase 8)
--
-- The function unconditionally rewrote profiles.referral_code on every
-- call, so opening the Referral page twice invalidated the link the user
-- had already shared (and every code previously handed out stopped
-- resolving). It now returns the stored code when one exists and only
-- mints a new one for profiles that have none.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_caller_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_existing TEXT;
  v_new_code TEXT;
  v_counter INT := 0;
  v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_random_bytes BYTEA;
  v_i INT;
  v_byte_val INT;
BEGIN
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT referral_code INTO v_existing
  FROM profiles
  WHERE id = p_caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_random_bytes := gen_random_bytes(5);
    v_new_code := '';
    FOR v_i IN 0..4 LOOP
      v_byte_val := get_byte(v_random_bytes, v_i);
      v_new_code := v_new_code || SUBSTRING(v_alphabet FROM (v_byte_val % 32) + 1 FOR 1);
      v_byte_val := v_byte_val / 32;
      v_new_code := v_new_code || SUBSTRING(v_alphabet FROM (v_byte_val % 32) + 1 FOR 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE referral_code = v_new_code
    );
    v_counter := v_counter + 1;
    IF v_counter > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', v_counter;
    END IF;
  END LOOP;

  UPDATE profiles SET referral_code = v_new_code WHERE id = p_caller_id;

  RETURN v_new_code;
END;
$function$;
