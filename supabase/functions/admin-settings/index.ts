import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin, errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";
import {
  loadEmailConfig,
  sendViaResend,
  checkResendDomainStatus,
  isValidEmail,
} from "../_shared/email.ts";

// Keys that must never leave the server, in either settings table.
const SENSITIVE_KEYS = ["resend_api_key", "sms_api_key", "vapid_private_key"];

// Strip any sensitive values from a settings row list before returning.
function redactSensitive<T extends { key?: string; setting_name?: string; value?: unknown; setting_value?: unknown }>(
  rows: T[]
): T[] {
  return rows.filter((r) => {
    const k = r.key ?? r.setting_name;
    return !k || !SENSITIVE_KEYS.includes(k);
  });
}

// Mask an API key for the admin UI: "configured, ends in xxxx".
function maskKey(v: string | null | undefined): string {
  if (!v) return "";
  return v.length > 8 ? `configured, ends in ${v.slice(-4)}` : "configured";
}
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
    settings: z.record(z.string(), z.string()),
  }),
  z.object({
    action: z.literal("save_system_settings"),
    settings: z.record(z.string(), z.string()),
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
  z.object({
    action: z.literal("save_email_config"),
    // resend_api_key is write-only: a non-empty string replaces the key;
    // omitted/empty leaves the stored key unchanged.
    resend_api_key: z.string().trim().optional(),
    email_from: z.string().trim().refine(isValidEmail, "From email must be a valid email address"),
    email_from_name: z.string().trim().min(1, "From name is required").max(80),
    email_reply_to: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidEmail(v), "Reply-to must be a valid email address")
      .optional(),
    email_enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("send_test_email"),
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
    const [appRes, sysRes, pricingRes, emailCfg] = await Promise.all([
      admin.from("app_settings").select("key, value, category, updated_at"),
      admin.from("system_settings").select("setting_name, setting_value"),
      admin.from("pricing").select("key, amount, normal_price, agent_price").in("key", [
        "afa_registration",
        "wallet_max_topup",
        "wallet_min_topup",
      ]),
      loadEmailConfig(admin),
    ]);
    // Filter sensitive keys from BOTH tables (system_settings was previously
    // returned unfiltered — closed here).
    const safeAppSettings = redactSensitive(appRes.data || []);
    const safeSystemSettings = redactSensitive(sysRes.data || []);
    // Build the email section. The raw key is NEVER returned — masked only.
    const sysMap = new Map<string, string>();
    for (const r of sysRes.data ?? []) sysMap.set(r.setting_name, r.setting_value ?? "");
    const rawKey = sysMap.get("resend_api_key") ?? "";
    const enabled = (sysMap.get("email_enabled") ?? "false").toLowerCase() === "true";
    let emailStatus: { configured: boolean; enabled: boolean; from: string; domain: string | null; verified: boolean | null };
    if (!emailCfg.error && emailCfg.config) {
      // Config is valid — fetch domain verification server-side.
      const c = emailCfg.config;
      const domainCheck = await checkResendDomainStatus(c.apiKey, c.fromEmail);
      emailStatus = {
        configured: true,
        enabled: c.enabled,
        from: `${c.fromName} <${c.fromEmail}>`,
        domain: domainCheck?.domain ?? null,
        verified: domainCheck?.verified ?? null,
      };
    } else {
      emailStatus = {
        configured: Boolean(rawKey),
        enabled,
        from: `${sysMap.get("email_from_name") ?? ""} <${sysMap.get("email_from") ?? ""}>`,
        domain: null,
        verified: null,
      };
    }
    return successResp(
      {
        app_settings: safeAppSettings,
        system_settings: safeSystemSettings,
        pricing: pricingRes.data || [],
        email: {
          resend_api_key: maskKey(rawKey),
          email_from: sysMap.get("email_from") ?? "",
          email_from_name: sysMap.get("email_from_name") ?? "",
          email_reply_to: sysMap.get("email_reply_to") ?? "",
          email_enabled: enabled,
          status: emailStatus,
        },
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
      // Redact sensitive keys (this path previously returned them raw).
      return successResp(
        {
          app_settings: redactSensitive(appRes.data || []),
          system_settings: redactSensitive(sysRes.data || []),
        },
        origin
      );
    }
    case "save_email_config": {
      // Allowlist: only the five email keys can be written. The API key is
      // write-only — it is stored but never echoed back.
      const now = new Date().toISOString();
      const writes: Array<{ setting_name: string; setting_value: string }> = [
        { setting_name: "email_from", setting_value: data.email_from },
        { setting_name: "email_from_name", setting_value: data.email_from_name },
        { setting_name: "email_reply_to", setting_value: data.email_reply_to ?? "" },
        { setting_name: "email_enabled", setting_value: String(data.email_enabled) },
      ];
      // Only overwrite the key when a new non-empty value is supplied.
      if (data.resend_api_key && data.resend_api_key.trim() !== "") {
        writes.push({ setting_name: "resend_api_key", setting_value: data.resend_api_key.trim() });
      }
      for (const w of writes) {
        const { error } = await admin
          .from("system_settings")
          .upsert(
            { setting_name: w.setting_name, setting_value: w.setting_value, updated_at: now },
            { onConflict: "setting_name" }
          );
        if (error) {
          console.error("save_email_config upsert error:", error.message);
          return errorResp("Failed to save email settings", 500, origin);
        }
      }
      // Audit log — record the action but NEVER the key value.
      await admin.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "email_config_saved",
        entity: "system_settings",
        entity_id: "email_config",
        new_value: {
          email_from: data.email_from,
          email_from_name: data.email_from_name,
          email_reply_to: data.email_reply_to ?? "",
          email_enabled: data.email_enabled,
          resend_api_key_updated: Boolean(data.resend_api_key && data.resend_api_key.trim() !== ""),
        },
      });
      return successResp({ message: "Email settings saved" }, origin);
    }
    case "send_test_email": {
      // Admin-only (already gated). Sends to the logged-in admin's own
      // address. Rate limited per admin.
      const { data: allowed } = await admin.rpc("check_rate_limit", {
        p_key: `email_test:${auth.user.id}`,
        p_action: "send_test_email",
        p_max_attempts: 3,
        p_window_seconds: 300,
      });
      if (allowed === false) {
        return errorResp("Rate limit exceeded. Try again later.", 429, origin);
      }
      const adminEmail = auth.user.email;
      if (!adminEmail || !isValidEmail(adminEmail)) {
        return errorResp("No valid admin email on file", 400, origin);
      }
      const loaded = await loadEmailConfig(admin);
      if (loaded.error) {
        return errorResp(loaded.error, 400, origin);
      }
      const result = await sendViaResend(loaded.config, {
        to: adminEmail,
        subject: "Test email — MTN AFA Portal",
        html:
          `<!doctype html><body style="font-family:Arial,sans-serif;padding:24px;">` +
          `<h2 style="margin:0 0 12px;">Test email</h2>` +
          `<p>This is a test email from the MTN AFA Portal admin settings.</p>` +
          `<p>If you received it, Resend is configured correctly.</p></body>`,
      });
      if (!result.ok) {
        return errorResp(result.error || "Test email failed", 502, origin);
      }
      // Log the test send (no key).
      await admin.from("audit_logs").insert({
        user_id: auth.user.id,
        action: "email_test_sent",
        entity: "system_settings",
        entity_id: "email_config",
        new_value: { to: adminEmail, provider_id: result.id },
      });
      return successResp({ id: result.id, status: "sent", to: adminEmail }, origin);
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
