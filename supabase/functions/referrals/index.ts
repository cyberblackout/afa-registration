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

    // Auto-generate referral code if missing
    if (!data.referral_code) {
      await admin.rpc("generate_referral_code");
      const { data: updated } = await admin
        .from("profiles")
        .select("*")
        .eq("id", auth.user!.id)
        .single();
      return successResp(updated, origin);
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

  switch (data.action) {
    case "get_stats": {
      const { data: stats, error } = await admin.rpc("get_referral_stats");
      if (error) return errorResp("Failed to get stats", 500, origin);
      return successResp(stats, origin);
    }

    case "get_my_referrals": {
      const { data: referrals, error } = await admin
        .from("referrals")
        .select("*, referred_profile:profiles!referred_id(full_name, email, phone)")
        .eq("referrer_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch referrals", 500, origin);
      return successResp(referrals, origin);
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
      const { data: code, error } = await admin.rpc("generate_referral_code");
      if (error) return errorResp("Failed to generate code", 500, origin);
      return successResp(code, origin);
    }

    case "validate_code": {
      const { data: result, error } = await admin.rpc("validate_referral_code", {
        code: data.code,
      });
      if (error) return errorResp("Failed to validate code", 500, origin);
      return successResp(result, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
