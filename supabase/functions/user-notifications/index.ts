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
    action: z.literal("list"),
  }),
  z.object({
    action: z.literal("mark_read"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("mark_all_read"),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unread_count"),
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
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", auth.user!.id)
      .order("created_at", { ascending: false });
    if (error) return errorResp("Failed to fetch notifications", 500, origin);
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
    case "list": {
      const { data: notifications, error } = await admin
        .from("notifications")
        .select("*")
        .eq("user_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch notifications", 500, origin);
      return successResp(notifications, origin);
    }

    case "unread_count": {
      const { count, error } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user!.id)
        .eq("read", false);
      if (error) return errorResp("Failed to count", 500, origin);
      return successResp({ count: count || 0 }, origin);
    }

    case "mark_read": {
      const { error } = await admin
        .from("notifications")
        .update({ read: true })
        .eq("id", data.id)
        .eq("user_id", auth.user!.id);
      if (error) return errorResp("Failed to mark as read", 500, origin);
      return successResp({ message: "Marked as read" }, origin);
    }

    case "mark_all_read": {
      const { error } = await admin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", auth.user!.id)
        .eq("read", false);
      if (error) return errorResp("Failed to mark all as read", 500, origin);
      return successResp({ message: "All marked as read" }, origin);
    }

    case "delete": {
      const { error } = await admin
        .from("notifications")
        .delete()
        .eq("id", data.id)
        .eq("user_id", auth.user!.id);
      if (error) return errorResp("Failed to delete notification", 500, origin);
      return successResp({ message: "Deleted" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
