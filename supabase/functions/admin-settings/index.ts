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

// Must stay byte-identical with the frontend schema in
// src/pages/admin/SettingsPage.tsx (afaPriceSchema).
const MAX_AFA_PRICE = 1000000;

const afaPriceSchema = (label: string) =>
  z.unknown().transform((v, ctx): number => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      ctx.addIssue({ code: "custom", message: "Both prices are required" });
      return z.NEVER;
    }
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number` });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: "custom", message: `${label} must be greater than 0` });
      return z.NEVER;
    }
    if (Math.round(n * 100) / 100 !== n) {
      ctx.addIssue({
        code: "custom",
        message: `${label} supports a maximum of 2 decimal places`,
      });
      return z.NEVER;
    }
    if (n > MAX_AFA_PRICE) {
      ctx.addIssue({
        code: "custom",
        message: `${label} cannot exceed 1,000,000.00`,
      });
      return z.NEVER;
    }
    return n;
  });

const AFA_PRICE_RATE_LIMIT = 10;
const AFA_PRICE_RATE_WINDOW_SECONDS = 60;

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
    action: z.literal("save_afa_prices"),
    normal_price: afaPriceSchema("Normal user price"),
    agent_price: afaPriceSchema("Agent price"),
  }),
  z.object({
    action: z.literal("save_fees"),
    agent_fee: z.number().min(0),
    wallet_max_topup: z.number().min(0),
    wallet_min_topup: z.number().min(0),
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
      admin.from("pricing").select("key, amount, normal_price, agent_price").in("key", [
        "afa_registration",
        "wallet_max_topup",
        "wallet_min_topup",
      ]),
    ]);

    // Filter out sensitive keys that must never be exposed via API
    const SENSITIVE_KEYS = [
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

    case "save_afa_prices": {
      const { data: allowed } = await admin.rpc("check_rate_limit", {
        p_key: `afa_pricing:${auth.user.id}`,
        p_action: "admin_set_afa_pricing",
        p_max_attempts: AFA_PRICE_RATE_LIMIT,
        p_window_seconds: AFA_PRICE_RATE_WINDOW_SECONDS,
      });

      if (allowed === false) {
        return errorResp("Rate limit exceeded. Try again later.", 429, origin);
      }

      const { data: result, error: rpcError } = await admin.rpc(
        "admin_set_afa_pricing",
        {
          p_caller_id: auth.user.id,
          p_normal_price: data.normal_price,
          p_agent_price: data.agent_price,
        }
      );

      if (rpcError) {
        const message = rpcError.message || "";
        if (
          message.includes("Authentication required") ||
          message.includes("Caller profile not found") ||
          message.includes("Insufficient permissions") ||
          message.includes("must be greater than 0") ||
          message.includes("2 decimal places") ||
          message.includes("cannot exceed") ||
          message.includes("Both prices are required") ||
          message.includes("not configured")
        ) {
          return errorResp(message, 400, origin);
        }
        console.error("save_afa_prices rpc error:", message);
        return errorResp("Failed to save AFA pricing", 500, origin);
      }

      if (result && !result.success) {
        return errorResp(result.error || "Failed to save AFA pricing", 400, origin);
      }

      return successResp(result, origin);
    }

    case "save_fees": {
      // Save agent_fee to app_settings (the fee to BECOME an agent —
      // deliberately unrelated to the AFA registration price)
      await admin
        .from("app_settings")
        .upsert(
          { key: "agent_fee", value: data.agent_fee.toString(), category: "agent" },
          { onConflict: "key" }
        );

      // Update pricing table. AFA prices are owned exclusively by the
      // save_afa_prices action so there is exactly one write path per price.
      const pricingUpdates = [
        { key: "wallet_max_topup", amount: data.wallet_max_topup },
        { key: "wallet_min_topup", amount: data.wallet_min_topup },
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
