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

  // Step 1: Database soft-delete via RPC
  const { data, error } = await admin.rpc("admin_soft_delete_user", {
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
      message.includes("already soft-deleted") ||
      message.includes("Cannot delete admin") ||
      message.includes("not found")
    ) {
      return errorResp(message, 400, origin);
    }
    return errorResp("Failed to delete user: " + message, 500, origin);
  }

  if (data && !data.success) {
    return errorResp(data.message || "Delete failed", 400, origin);
  }

  // Step 2: Auth ban (after DB soft-delete succeeds)
  let authBanFailed = false;
  let authBanError = "";
  try {
    const { error: banError } = await admin.auth.admin.updateUserById(target_user_id, {
      ban_duration: "100y",
    });
    if (banError) {
      authBanFailed = true;
      authBanError = banError.message || "Ban failed";
    }
  } catch (e: any) {
    authBanFailed = true;
    authBanError = e.message || "Ban request failed";
  }

  if (authBanFailed) {
    return successResp(
      {
        ...data,
        data: {
          ...data.data,
          auth_ban_status: "failed",
          auth_ban_error: authBanError,
          note: "User was soft-deleted in database but auth ban failed. The user cannot access admin/agent features (role reset to user, PII scrubbed) but may still be able to log in. Retry the auth ban manually or via re-invocation.",
        },
      },
      origin,
    );
  }

  return successResp(data, origin);
});
