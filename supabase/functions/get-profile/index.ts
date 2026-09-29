import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  jsonResp,
  errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody, toNumeric, differenceInCents } from "../_shared/validation.ts";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get_user_role"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("is_admin") }),
  z.object({ action: z.literal("get_wallet_balance"), user_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("upload_avatar"), file_name: z.string().min(1), file_content: z.string().min(1) }),
  z.object({ action: z.literal("get_registration"), id: z.string().uuid() }),
  z.object({ action: z.literal("get_afa_pricing") }),
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
      const ext = data.file_name.split(".").pop()?.toLowerCase() || "";
      const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowedExts.includes(ext)) {
        return errorResp("Invalid file type. Allowed: JPG, PNG, WebP, GIF", 400, origin);
      }

      const binaryContent = Uint8Array.from(atob(data.file_content), (c) => c.charCodeAt(0));
      if (binaryContent.length > MAX_FILE_SIZE) {
        return errorResp("File too large. Maximum size is 2MB", 400, origin);
      }

      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return errorResp("Invalid image type", 400, origin);
      }

      const filePath = `avatars/${auth.user!.id}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from("profiles")
        .upload(filePath, binaryContent, {
          contentType: mimeType,
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

    // Resolves the caller's OWN AFA price from their real role in the database.
    // The other tier's price is never returned to a non-admin.
    case "get_afa_pricing": {
      const [{ data: profile }, { data: priceRows }] = await Promise.all([
        admin.from("profiles").select("role").eq("id", auth.user!.id).single(),
        admin
          .from("pricing")
          .select("key, amount, normal_price, agent_price")
          .in("key", ["afa_registration", "wallet_max_topup"]),
      ]);

      if (!profile) {
        return errorResp("Profile not found", 404, origin);
      }

      const rows = priceRows || [];
      const afa = rows.find((r: any) => r.key === "afa_registration");
      const maxTopup = rows.find((r: any) => r.key === "wallet_max_topup");

      const tier: "normal" | "agent" = profile.role === "agent" ? "agent" : "normal";
      const price = tier === "agent" ? afa?.agent_price : afa?.normal_price;
      const priceNumeric = toNumeric(price);

      if (!afa || priceNumeric === null || priceNumeric <= 0) {
        return errorResp(
          "AFA registration pricing is not configured. Please contact support.",
          500,
          origin
        );
      }

      // Raw numeric strings are passed through untouched; the client parses
      // them with safeNumber()/formatCurrency() from src/utils/number.ts.
      const payload: Record<string, unknown> = {
        tier,
        price,
        max_topup: maxTopup?.amount ?? null,
      };

      if (profile.role === "admin") {
        payload.normal_price = afa.normal_price ?? null;
        payload.agent_price = afa.agent_price ?? null;
      }

      const profitCents = differenceInCents(afa?.normal_price, afa?.agent_price);
      if (profitCents !== null) {
        payload.profit_margin = Math.max(profitCents, 0) / 100;
      }

      return successResp(payload, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
