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
    action: z.literal("get_dashboard"),
  }),
  z.object({
    action: z.literal("get_applications"),
  }),
  z.object({
    action: z.literal("approve"),
    application_id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    admin_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("toggle_status"),
    user_id: z.string().uuid(),
    status: z.enum(["active", "suspended"]),
  }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  // Agents can get dashboard; admins can do everything
  if (req.method === "GET") {
    const auth = await verifyAuth(req, ["agent", "admin"]);
    if (auth.error) return auth.error;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("get_agent_dashboard");
    if (error) return errorResp("Failed to get dashboard", 500, origin);
    return successResp(data, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "get_dashboard": {
      const { data: dashboard, error } = await admin.rpc("get_agent_dashboard");
      if (error) return errorResp("Failed to get dashboard", 500, origin);
      return successResp(dashboard, origin);
    }

    case "get_applications": {
      const { data: apps, error } = await admin.rpc("admin_get_agent_applications");
      if (error) return errorResp("Failed to get applications", 500, origin);
      return successResp(apps, origin);
    }

    case "approve": {
      const { data: result, error } = await admin.rpc("approve_agent_application", {
        p_application_id: data.application_id,
        p_status: data.status,
        p_admin_notes: data.admin_notes,
      });
      if (error) return errorResp("Failed to approve/reject", 500, origin);
      return successResp(result, origin);
    }

    case "toggle_status": {
      const { data: result, error } = await admin.rpc("admin_toggle_agent_status", {
        p_user_id: data.user_id,
        p_status: data.status,
      });
      if (error) return errorResp("Failed to toggle status", 500, origin);
      return successResp(result, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
