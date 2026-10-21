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
  reason: z.string().max(500, "Reason too long").optional(),
});
const DELETE_RATE_LIMIT = 5;
const DELETE_RATE_WINDOW = 600;
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
  const { target_user_id, reason } = validation.data!;
  const admin = getSupabaseAdmin();
  // Rate limit: max N deletions per admin per window
  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key: `delete_user:${auth.user.id}`,
    p_action: "admin_delete_user",
    p_max_attempts: DELETE_RATE_LIMIT,
    p_window_seconds: DELETE_RATE_WINDOW,
  });
  if (allowed === false) {
    return errorResp("Rate limit exceeded. Try again later.", 429, origin);
  }
  // Step 1: Database hard-delete preparation via RPC.
  // Snapshots the target into deleted_users_audit, writes an audit_logs entry,
  // and purges ephemeral data (notifications, push_subscriptions). All
  // safety checks (caller admin, no self-delete, no admin targets) live here.
  const { data, error } = await admin.rpc("admin_hard_delete_user", {
    p_caller_id: auth.user.id,
    p_target_user_id: target_user_id,
    p_reason: reason || null,
  });
  if (error) {
    const message = error.message || "Failed to delete user";
    if (
      message.includes("Authentication required") ||
      message.includes("Insufficient permissions") ||
      message.includes("Cannot delete your own") ||
      message.includes("Cannot delete admin") ||
      message.includes("User not found") ||
      message.includes("caller mismatch")
    ) {
      return errorResp(message, 400, origin);
    }
    return errorResp("Failed to delete user: " + message, 500, origin);
  }
  if (data && !data.success) {
    return errorResp(data.message || "Delete failed", 400, origin);
  }
  // Step 2: TRUE HARD DELETE of the Supabase Auth account via the Admin API.
  // Deleting auth.users cascades to public.profiles (FK ON DELETE CASCADE),
  // which in turn cascades to orders and wallet_transactions — a complete,
  // clean purge of the user and every linked record.
  let authDeleteFailed = false;
  let authDeleteError = "";
  try {
    const { error: deleteError } = await admin.auth.admin.deleteUser(target_user_id);
    if (deleteError) {
      authDeleteFailed = true;
      authDeleteError = deleteError.message || "Auth delete failed";
    }
  } catch (e) {
    authDeleteFailed = true;
    authDeleteError = (e instanceof Error ? e.message : null) || "Auth delete request failed";
  }
  if (authDeleteFailed) {
    return errorResp(
      "Database cleanup succeeded but deleting the authentication account failed: " +
        authDeleteError +
        ". The user still exists — retry the deletion.",
      500,
      origin,
    );
  }
  return successResp(
    {
      success: true,
      target_user_id,
      hard_deleted: true,
      auth_delete_status: "success",
    },
    origin,
  );
});
