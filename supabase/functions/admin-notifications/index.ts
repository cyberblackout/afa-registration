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
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("send"),
    title: z.string().min(1),
    message: z.string().min(1),
    type: z.enum(["info", "warning", "success", "error"]).optional(),
    user_ids: z.array(z.string().uuid()).optional(),
    send_to_all: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("upload_image"),
    file_name: z.string().min(1),
    file_content: z.string().min(1),
  }),
  z.object({ action: z.literal("get_all_user_ids") }),
  z.object({ action: z.literal("resolve_email"), email: z.string().min(1) }),
  z.object({
    action: z.literal("insert_notification"),
    user_id: z.string().uuid(),
    title: z.string().min(1),
    message: z.string().min(1),
    type: z.enum(["info", "warning", "success", "error"]).optional(),
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
    const { data, error } = await admin
      .from("notifications")
      .select("*, profiles!notifications_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(20);
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
        .select("*, profiles!notifications_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return errorResp("Failed to fetch notifications", 500, origin);
      return successResp(notifications, origin);
    }

    case "send": {
      let targetUserIds = data.user_ids || [];

      if (data.send_to_all) {
        const { data: allUsers } = await admin.from("profiles").select("id");
        targetUserIds = (allUsers || []).map((u: any) => u.id);
      }

      if (targetUserIds.length === 0) {
        return errorResp("No recipients specified", 400, origin);
      }

      const notifications = targetUserIds.map((userId) => ({
        user_id: userId,
        title: data.title,
        message: data.message,
        type: data.type || "info",
        read: false,
      }));

      for (let i = 0; i < notifications.length; i += 100) {
        const chunk = notifications.slice(i, i + 100);
        const { error } = await admin.from("notifications").insert(chunk);
        if (error) {
          console.error("admin-notifications send error:", error);
          return errorResp("Failed to send notifications", 500, origin);
        }
      }

      return successResp(
        { message: `Notification sent to ${targetUserIds.length} users` },
        origin
      );
    }

    case "upload_image": {
      const ext = data.file_name.split(".").pop() || "png";
      const filePath = `notifications/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;

      const binaryContent = Uint8Array.from(atob(data.file_content), (c) =>
        c.charCodeAt(0)
      );

      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(filePath, binaryContent, {
          contentType: `image/${ext}`,
        });

      if (uploadError) {
        console.error("upload error:", uploadError);
        return errorResp("Failed to upload image", 500, origin);
      }

      const { data: urlData } = admin.storage
        .from("documents")
        .getPublicUrl(filePath);

      return successResp({ url: urlData.publicUrl }, origin);
    }

    case "get_all_user_ids": {
      const { data: users, error } = await admin.from("profiles").select("id");
      if (error) return errorResp("Failed to fetch users", 500, origin);
      return successResp((users || []).map((u: any) => u.id), origin);
    }

    case "resolve_email": {
      const { data: profile, error } = await admin
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .single();
      if (error || !profile) {
        return errorResp("User with that email not found", 404, origin);
      }
      return successResp(profile.id, origin);
    }

    case "insert_notification": {
      const { error } = await admin.from("notifications").insert({
        user_id: data.user_id,
        title: data.title,
        message: data.message,
        type: data.type || "info",
      });
      if (error) return errorResp("Failed to insert notification", 500, origin);
      return successResp({ message: "Notification created" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
