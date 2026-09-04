import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";

const actionSchema = z.object({
  target_user_id: z.string().uuid("Invalid user ID"),
  new_role: z.enum(["user", "agent", "admin"], {
    errorMap: () => ({
      message: "Role must be one of: user, agent, admin",
    }),
  }),
});

const ROLE_CHANGE_RATE_LIMIT = 10;
const ROLE_CHANGE_WINDOW_SECONDS = 60;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const { target_user_id, new_role } = validation.data!;
  const admin = getSupabaseAdmin();

  // Rate limit: max N role changes per admin per window
  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key: `role_change:${auth.user.id}`,
    p_action: "admin_set_user_role",
    p_max_attempts: ROLE_CHANGE_RATE_LIMIT,
    p_window_seconds: ROLE_CHANGE_WINDOW_SECONDS,
  });

  if (allowed === false) {
    return errorResp("Rate limit exceeded. Try again later.", 429, origin);
  }

  const { data, error } = await admin.rpc("admin_set_user_role", {
    p_caller_id: auth.user.id,
    p_target_user_id: target_user_id,
    p_new_role: new_role,
  });

  if (error) {
    const message = error.message || "Failed to update role";
    if (
      message.includes("Authentication required") ||
      message.includes("Insufficient permissions") ||
      message.includes("Invalid role") ||
      message.includes("Target user not found") ||
      message.includes("Cannot change your own role") ||
      message.includes("Admin role cannot be removed") ||
      message.includes("Cannot demote the last admin") ||
      message.includes("already")
    ) {
      return errorResp(message, 400, origin);
    }
    return errorResp("Failed to update role: " + message, 500, origin);
  }

  if (data && !data.success) {
    return errorResp(data.message || "Role update failed", 400, origin);
  }

  return successResp(data, origin);
});
