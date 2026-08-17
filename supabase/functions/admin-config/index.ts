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
  z.object({ action: z.literal("get_whatsapp") }),
  z.object({ action: z.literal("update_whatsapp"), settings: z.record(z.string()) }),
  z.object({ action: z.literal("get_payment") }),
  z.object({ action: z.literal("update_payment"), settings: z.record(z.string()) }),
  z.object({ action: z.literal("get_announcements"), active_only: z.boolean().optional() }),
  z.object({ action: z.literal("create_announcement"), title: z.string().min(1), message: z.string().min(1), active: z.boolean().optional() }),
  z.object({ action: z.literal("get_system_settings") }),
  z.object({ action: z.literal("get_paystack_config") }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  // Public read for active announcements
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "announcements") {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from("announcements")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch announcements", 500, origin);
      return successResp(data, origin);
    }

    // system_settings read for WhatsApp config (authenticated users)
    if (action === "system_settings") {
      const auth = await verifyAuth(req);
      if (auth.error) return auth.error;
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.from("system_settings").select("setting_name, setting_value");
      if (error) return errorResp("Failed to fetch system settings", 500, origin);
      return successResp(data, origin);
    }

    // paystack_config (authenticated users)
    if (action === "paystack_config") {
      const auth = await verifyAuth(req);
      if (auth.error) return auth.error;
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.rpc("get_paystack_config");
      if (error) return errorResp("Failed to fetch Paystack config", 500, origin);
      return successResp(data, origin);
    }

    // All other GET endpoints require admin
    const auth = await verifyAuth(req, ["admin"]);
    if (auth.error) return auth.error;

    const admin = getSupabaseAdmin();

    if (action === "whatsapp") {
      const { data, error } = await admin.from("whatsapp_config").select("*");
      if (error) return errorResp("Failed to fetch WhatsApp config", 500, origin);
      return successResp(data, origin);
    }

    if (action === "payment") {
      const { data, error } = await admin.from("payment_config").select("*");
      if (error) return errorResp("Failed to fetch payment config", 500, origin);
      return successResp(data, origin);
    }

    if (action === "all_announcements") {
      const { data, error } = await admin
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch announcements", 500, origin);
      return successResp(data, origin);
    }

    return errorResp("Invalid action", 400, origin);
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
    case "get_whatsapp": {
      const { data: config, error } = await admin.from("whatsapp_config").select("*");
      if (error) return errorResp("Failed to fetch", 500, origin);
      return successResp(config, origin);
    }

    case "update_whatsapp": {
      const entries = Object.entries(data.settings);
      for (const [key, value] of entries) {
        await admin
          .from("whatsapp_config")
          .upsert({ key, value }, { onConflict: "key" });
      }
      return successResp({ message: "WhatsApp config updated" }, origin);
    }

    case "get_payment": {
      const { data: config, error } = await admin.from("payment_config").select("*");
      if (error) return errorResp("Failed to fetch", 500, origin);
      return successResp(config, origin);
    }

    case "update_payment": {
      const entries = Object.entries(data.settings);
      for (const [key, value] of entries) {
        await admin
          .from("payment_config")
          .upsert({ key, value }, { onConflict: "key" });
      }
      return successResp({ message: "Payment config updated" }, origin);
    }

    case "get_announcements": {
      let query = admin.from("announcements").select("*").order("created_at", { ascending: false });
      if (data.active_only) query = query.eq("active", true);
      const { data: announcements, error } = await query;
      if (error) return errorResp("Failed to fetch announcements", 500, origin);
      return successResp(announcements, origin);
    }

    case "create_announcement": {
      const { error } = await admin.from("announcements").insert({
        title: data.title,
        message: data.message,
        active: data.active ?? true,
      });
      if (error) return errorResp("Failed to create announcement", 500, origin);
      return successResp({ message: "Announcement created" }, origin);
    }

    case "get_system_settings": {
      const { data: settings, error } = await admin.from("system_settings").select("*");
      if (error) return errorResp("Failed to fetch system settings", 500, origin);
      return successResp(settings, origin);
    }

    case "get_paystack_config": {
      const { data: config, error } = await admin.rpc("get_paystack_config");
      if (error) return errorResp("Failed to fetch Paystack config", 500, origin);
      return successResp(config, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
