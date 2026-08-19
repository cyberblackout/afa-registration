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
    action: z.literal("get_all"),
  }),
  z.object({
    action: z.literal("save_app_settings"),
    settings: z.record(z.string()),
  }),
  z.object({
    action: z.literal("save_system_settings"),
    settings: z.record(z.string()),
  }),
  z.object({
    action: z.literal("save_fees"),
    agent_fee: z.number().min(0),
    afa_registration: z.number().min(0),
    wallet_max_topup: z.number().min(0),
    wallet_min_topup: z.number().min(0),
    referral_bonus: z.number().min(0),
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
    const [appRes, sysRes, pricingRes] = await Promise.all([
      admin.from("app_settings").select("key, value, category, updated_at"),
      admin.from("system_settings").select("setting_name, setting_value"),
      admin.from("pricing").select("key, amount").in("key", [
        "afa_registration",
        "wallet_max_topup",
        "wallet_min_topup",
        "referral_bonus",
      ]),
    ]);

    // Filter out sensitive keys that must never be exposed via API
    const SENSITIVE_KEYS = [
      "paystack_secret_key",
      "resend_api_key",
      "sms_api_key",
      "vapid_private_key",
    ];
    const safeAppSettings = (appRes.data || []).filter(
      (s: any) => !SENSITIVE_KEYS.includes(s.key)
    );

    return successResp(
      {
        app_settings: safeAppSettings,
        system_settings: sysRes.data || [],
        pricing: pricingRes.data || [],
      },
      origin
    );
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
    case "get_all": {
      const [appRes, sysRes] = await Promise.all([
        admin.from("app_settings").select("*"),
        admin.from("system_settings").select("*"),
      ]);
      return successResp(
        { app_settings: appRes.data, system_settings: sysRes.data },
        origin
      );
    }

    case "save_app_settings": {
      const entries = Object.entries(data.settings);
      for (const [key, value] of entries) {
        await admin
          .from("app_settings")
          .upsert({ key, value }, { onConflict: "key" });
      }
      return successResp({ message: "App settings saved" }, origin);
    }

    case "save_system_settings": {
      const entries = Object.entries(data.settings);
      for (const [key, value] of entries) {
        await admin
          .from("system_settings")
          .upsert({ setting_name: key, setting_value: value }, { onConflict: "setting_name" });
      }
      return successResp({ message: "System settings saved" }, origin);
    }

    case "save_fees": {
      // Save agent_fee to app_settings
      await admin
        .from("app_settings")
        .upsert(
          { key: "agent_fee", value: data.agent_fee.toString(), category: "agent" },
          { onConflict: "key" }
        );

      // Update pricing table
      const pricingUpdates = [
        { key: "afa_registration", amount: data.afa_registration },
        { key: "wallet_max_topup", amount: data.wallet_max_topup },
        { key: "wallet_min_topup", amount: data.wallet_min_topup },
        { key: "referral_bonus", amount: data.referral_bonus },
      ];

      for (const p of pricingUpdates) {
        await admin
          .from("pricing")
          .update({ amount: p.amount, normal_price: p.amount })
          .eq("key", p.key);
      }

      return successResp({ message: "Fees saved" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
