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
    action: z.literal("analytics"),
  }),
  z.object({
    action: z.literal("list"),
  }),
  z.object({
    action: z.literal("update_status"),
    id: z.string().uuid(),
    status: z.enum(["registered", "pending", "purchase_completed", "rejected"]),
  }),
  z.object({
    action: z.literal("retry_reward"),
    referral_id: z.string().uuid(),
  }),
]);

// admin_get_referral_analytics reports authorization problems inside its
// JSON payload ({"error": "Unauthorized"}) rather than as a SQL error, so a
// plain `{ error }` destructure would otherwise ship them as a 200.
async function fetchAnalytics(admin: ReturnType<typeof getSupabaseAdmin>, callerId: string) {
  const { data, error } = await admin.rpc("admin_get_referral_analytics", {
    p_caller_id: callerId,
  });
  if (error) return { rpcError: error.message };
  if (data && data.error) return { authError: String(data.error) };
  return { analytics: data };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    const admin = getSupabaseAdmin();
    const result = await fetchAnalytics(admin, auth.user!.id);
    if (result.rpcError) return errorResp("Failed to get analytics", 500, origin);
    if (result.authError) return errorResp(result.authError, 403, origin);
    return successResp(result.analytics, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  // Money-moving admin action: rate limit per admin user id (never per IP).
  const limit = async (
    action: string,
    p_max_attempts: number,
    p_window_seconds: number
  ): Promise<Response | null> => {
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_key: `referral_admin:${auth.user!.id}`,
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
    case "analytics": {
      const result = await fetchAnalytics(admin, auth.user!.id);
      if (result.rpcError) return errorResp("Failed to get analytics", 500, origin);
      if (result.authError) return errorResp(result.authError, 403, origin);
      return successResp(result.analytics, origin);
    }

    case "list": {
      const { data: referrals, error } = await admin
        .from("referrals")
        .select("*, referrer:profiles!referrer_id(full_name, email, phone), referred:profiles!referred_id(full_name, email, phone)")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch referrals", 500, origin);
      return successResp(referrals, origin);
    }

    case "update_status": {
      const { error } = await admin
        .from("referrals")
        .update({ status: data.status })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update status", 500, origin);
      return successResp({ message: "Status updated" }, origin);
    }

    case "retry_reward": {
      const limited = await limit("retry_reward", 10, 300);
      if (limited) return limited;
      const { data: referral, error: refErr } = await admin
        .from("referrals")
        .select("id, referred_id")
        .eq("id", data.referral_id)
        .maybeSingle();
      if (refErr) return errorResp("Failed to load referral", 500, origin);
      if (!referral) return errorResp("Referral not found", 404, origin);

      const { data: registration, error: regErr } = await admin
        .from("registrations")
        .select("id")
        .eq("user_id", referral.referred_id ?? "")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (regErr) return errorResp("Failed to load registration", 500, origin);
      if (!registration) {
        return errorResp("No completed registration found for this referred user", 409, origin);
      }

      const { data: reward, error } = await admin.rpc("process_referral_reward", {
        registration_id: registration.id,
      });
      if (error) {
        console.error("retry_reward error:", error);
        return errorResp("Failed to retry reward", 500, origin);
      }
      if (reward && reward.success === false) {
        return errorResp(String(reward.error ?? "Reward could not be retried"), 409, origin);
      }
      return successResp(reward, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
