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
  z.object({ action: z.literal("get_applications") }),
  z.object({ action: z.literal("get_application"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("get_transactions"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("get_pricing") }),
  z.object({ action: z.literal("check_permission"), permission: z.string().min(1) }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "get_applications": {
      if (auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { data: apps, error } = await admin
        .from("agent_applications")
        .select("*, profiles!agent_applications_user_id_fkey(full_name, email, phone)")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch applications", 500, origin);
      return successResp(apps, origin);
    }

    case "get_application": {
      const targetUserId = data.user_id || auth.user!.id;
      if (targetUserId !== auth.user!.id && auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { data: app, error } = await admin
        .from("agent_applications")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return errorResp("Failed to fetch application", 500, origin);
      return successResp(app, origin);
    }

    case "get_transactions": {
      const targetUserId = data.user_id || auth.user!.id;
      if (targetUserId !== auth.user!.id && auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { data: txns, error } = await admin
        .from("agent_transactions")
        .select("*")
        .eq("agent_id", targetUserId)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch transactions", 500, origin);
      return successResp(txns, origin);
    }

    case "get_pricing": {
      const { data: pricing, error } = await admin.rpc("get_agent_pricing");
      if (error) return errorResp("Failed to fetch pricing", 500, origin);
      return successResp(pricing, origin);
    }

    case "check_permission": {
      const { data: hasPermission, error } = await admin.rpc("check_permission", {
        p_permission: data.permission,
      });
      if (error) return errorResp("Failed to check permission", 500, origin);
      return successResp(hasPermission, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
