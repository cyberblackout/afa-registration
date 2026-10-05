import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  jsonResp,
  errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get_profile"),
  }),
  z.object({
    action: z.literal("get_stats"),
  }),
  z.object({
    action: z.literal("get_my_referrals"),
  }),
  z.object({
    action: z.literal("get_my_rewards"),
  }),
  z.object({
    action: z.literal("generate_code"),
  }),
  z.object({
    action: z.literal("validate_code"),
    code: z.string().min(1),
  }),
  z.object({
    action: z.literal("create_referral"),
    referral_code: z.string().min(1),
    device_fingerprint: z.string().optional(),
  }),
  z.object({
    action: z.literal("get_my_referral_transactions"),
  }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    // Default: get profile with referral code
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", auth.user!.id)
      .single();
    if (error) return errorResp("Profile not found", 404, origin);

    // Auto-generate referral code if missing. Same budget as the explicit
    // generate_code action (B12) so this path cannot be used to mint codes
    // without limit either; when the budget is spent we just return the
    // profile without a code instead of failing the profile fetch.
    if (!data.referral_code) {
      const { data: allowed } = await admin.rpc("check_rate_limit", {
        p_key: `referral:${auth.user!.id}`,
        p_action: "generate_code",
        p_max_attempts: 3,
        p_window_seconds: 3600,
      });
      if (allowed !== false) {
        await admin.rpc("generate_referral_code", { p_caller_id: auth.user!.id });
        const { data: updated } = await admin
          .from("profiles")
          .select("*")
          .eq("id", auth.user!.id)
          .single();
        return successResp(updated, origin);
      }
    }
    return successResp(data, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  // Rate limit referral mutations per user id (never per IP: shared/mobile
  // networks would otherwise punish unrelated users).
  const limit = async (
    action: string,
    p_max_attempts: number,
    p_window_seconds: number
  ): Promise<Response | null> => {
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_key: `referral:${auth.user!.id}`,
      p_action: action,
      p_max_attempts,
      p_window_seconds,
    });
    if (allowed === false) {
      return errorResp("Too many requests. Please wait a moment and try again.", 429, origin);
    }
    return null;
  };

  switch (data.action) {
    case "get_stats": {
      const { data: stats, error } = await admin.rpc("get_referral_stats", {
        p_caller_id: auth.user!.id,
      });
      if (error) return errorResp("Failed to get stats", 500, origin);
      return successResp(stats, origin);
    }

    case "get_my_referrals": {
      const { data: referrals, error } = await admin.rpc("get_my_referrals_masked", {
        p_caller_id: auth.user!.id,
      });
      if (error) return errorResp("Failed to fetch referrals", 500, origin);
      return successResp(referrals || [], origin);
    }

    case "get_my_rewards": {
      const { data: rewards, error } = await admin
        .from("referral_rewards")
        .select("*")
        .eq("user_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch rewards", 500, origin);
      return successResp(rewards, origin);
    }

    case "generate_code": {
      const limited = await limit("generate_code", 3, 3600);
      if (limited) return limited;
      const { data: code, error } = await admin.rpc("generate_referral_code", {
        p_caller_id: auth.user!.id,
      });
      if (error) return errorResp("Failed to generate code", 500, origin);
      return successResp(code, origin);
    }

    case "validate_code": {
      const limited = await limit("validate_code", 20, 60);
      if (limited) return limited;
      const { data: result, error } = await admin.rpc("validate_referral_code", {
        code: data.code,
        p_caller_id: auth.user!.id,
      });
      if (error) return errorResp("Failed to validate code", 500, origin);
      return successResp(result, origin);
    }

    case "create_referral": {
      const limited = await limit("create_referral", 5, 300);
      if (limited) return limited;
      const { data: result, error } = await admin.rpc("create_user_referral", {
        p_referral_code: data.referral_code,
        p_device_fingerprint: data.device_fingerprint || null,
        p_caller_id: auth.user!.id,
      });
      if (error) return errorResp("Failed to create referral", 500, origin);
      return successResp(result, origin);
    }

    case "get_my_referral_transactions": {
      const { data: txns, error } = await admin
        .from("wallet_transactions")
        .select("id, amount, description, reference, created_at, status")
        .eq("user_id", auth.user!.id)
        .ilike("description", "%referral%")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch transactions", 500, origin);
      return successResp(txns || [], origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
