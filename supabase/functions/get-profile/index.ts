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
  z.object({ action: z.literal("get_user_role"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("is_admin") }),
  z.object({ action: z.literal("get_wallet_balance"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("upload_avatar"), file_name: z.string().min(1), file_content: z.string().min(1) }),
  z.object({ action: z.literal("get_registration"), id: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method === "GET") {
    const auth = await verifyAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") || auth.user!.id;

    if (userId !== auth.user!.id && auth.user!.role !== "admin") {
      return errorResp("Insufficient permissions", 403, origin);
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      return errorResp("Profile not found", 404, origin);
    }

    return successResp(data, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "get_user_role": {
      const targetUserId = data.user_id || auth.user!.id;
      if (targetUserId !== auth.user!.id && auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { data: profile, error } = await admin
        .from("profiles")
        .select("role")
        .eq("id", targetUserId)
        .single();
      if (error) return errorResp("Profile not found", 404, origin);
      return successResp(profile.role, origin);
    }

    case "is_admin": {
      const { data: profile, error } = await admin
        .from("profiles")
        .select("role")
        .eq("id", auth.user!.id)
        .single();
      if (error) return errorResp("Profile not found", 404, origin);
      return successResp(profile.role === "admin", origin);
    }

    case "get_wallet_balance": {
      const targetUserId = data.user_id || auth.user!.id;
      if (targetUserId !== auth.user!.id && auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { data: profile, error } = await admin
        .from("profiles")
        .select("wallet_balance")
        .eq("id", targetUserId)
        .single();
      if (error) return errorResp("Profile not found", 404, origin);
      return successResp(profile, origin);
    }

    case "upload_avatar": {
      const ext = data.file_name.split(".").pop() || "png";
      const filePath = `avatars/${auth.user!.id}.${ext}`;
      const binaryContent = Uint8Array.from(atob(data.file_content), (c) => c.charCodeAt(0));

      const { error: uploadError } = await admin.storage
        .from("profiles")
        .upload(filePath, binaryContent, {
          contentType: `image/${ext}`,
          upsert: true,
        });
      if (uploadError) {
        console.error("upload_avatar error:", uploadError);
        return errorResp("Failed to upload avatar", 500, origin);
      }

      const { data: urlData } = admin.storage
        .from("profiles")
        .getPublicUrl(filePath);

      await admin
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", auth.user!.id);

      return successResp({ avatar_url: urlData.publicUrl }, origin);
    }

    case "get_registration": {
      const { data: reg, error } = await admin
        .from("registrations")
        .select("*, registration_documents(*), registration_timeline(*)")
        .eq("id", data.id)
        .single();
      if (error) return errorResp("Registration not found", 404, origin);

      if (reg.user_id !== auth.user!.id && auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }

      return successResp(reg, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
