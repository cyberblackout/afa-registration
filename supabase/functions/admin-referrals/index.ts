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
    status: z.string().min(1),
  }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("admin_get_referral_analytics");
    if (error) return errorResp("Failed to get analytics", 500, origin);
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
    case "analytics": {
      const { data: analytics, error } = await admin.rpc("admin_get_referral_analytics");
      if (error) return errorResp("Failed to get analytics", 500, origin);
      return successResp(analytics, origin);
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

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
