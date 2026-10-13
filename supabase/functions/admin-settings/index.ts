import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin, errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody, emailConfigSchema } from "../_shared/validation.ts";
import {
  loadEmailConfig,
  sendViaResend,
  checkResendDomainStatus,
  isValidEmail,
} from "../_shared/email.ts";
import { redactSensitiveRows, maskKey, PUBLIC_SYSTEM_SETTING_KEYS } from "../_shared/settings.ts";
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

// Server-side key allow-lists for the two generic save actions.
// The client already splits keys, but it must not be trusted: an
// arbitrary-key write would let a caller set email_from (bypassing the
// Resend domain rule in save_email_config) or overwrite resend_api_key
// outside that path. Default-deny — anything not listed is rejected.
const ALLOWED_SYSTEM_SETTING_KEYS: ReadonlySet<string> = new Set(PUBLIC_SYSTEM_SETTING_KEYS);
const ALLOWED_APP_SETTING_KEYS: ReadonlySet<string> = new Set([
  "site_name",
  "support_email",
  "support_phone",
  "address",
  "sms_api_url",
  "sms_api_key",
  "sms_sender_id",
  "agent_system_enabled",
  "agent_auto_approve",
  "agent_min_commission",
  "vapid_public_key",
  "vapid_private_key",
  "referral_enabled",
  "referral_reward_amount",
  "referral_max_daily",
  "referral_fraud_protection",
  "agent_fee",
]);

function rejectUnknownKeys(
  settings: Record<string, string>,
  allowed: ReadonlySet<string>
): string | null {
  const bad = Object.keys(settings).filter((k) => !allowed.has(k));
  return bad.length ? `Setting key(s) not allowed: ${bad.join(", ")}` : null;
}

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
  // Flat on the wire ({"action":"save_email_config", ...config}) but
  // every field, limit and message comes from emailConfigSchema, which
  // is mirrored byte-for-byte by src/utils/emailConfig.ts.
  z.object({ action: z.literal("save_email_config") }).extend(emailConfigSchema.shape),
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
    const safeAppSettings = redactSensitiveRows(appRes.data || []);
    const safeSystemSettings = redactSensitiveRows(sysRes.data || []);
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
          app_settings: redactSensitiveRows(appRes.data || []),
          system_settings: redactSensitiveRows(sysRes.data || []),
        },
        origin
      );
    }
    case "save_email_config": {
      // Allowlist: only the five email keys can be written. The API key is
      // write-only — it is stored but never echoed back.

      // ── From-domain rule ────────────────────────────────────────
      // The from address must sit on a domain Resend has verified for
      // this account, otherwise Resend rejects the send or the mail
      // fails SPF/DKIM at the receiver. Enforced server-side against
      // Resend's own domain list; the client can only hint.
      const suppliedKey = (data.resend_api_key ?? "").trim();
      const { data: storedKeyRow } = await admin
        .from("system_settings")
        .select("setting_value")
        .eq("setting_name", "resend_api_key")
        .maybeSingle();
      const effectiveKey = suppliedKey || storedKeyRow?.setting_value?.trim() || "";
      if (!effectiveKey) {
        return errorResp(
          "Save the Resend API key first — the from email must be on a domain Resend has verified.",
          400,
          origin
        );
      }
      const domainCheck = await checkResendDomainStatus(effectiveKey, data.email_from);
      if (!domainCheck) {
        return errorResp(
          "Could not verify the sending domain with Resend. Check the API key and try again.",
          502,
          origin
        );
      }
      if (!domainCheck.verified) {
        const expected = domainCheck.verifiedDomains.join(", ");
        return errorResp(
          expected
            ? `From email must be on your verified Resend domain (${expected}).`
            : `The domain "${domainCheck.domain}" is not verified in Resend. Verify it before using it as the from email.`,
          400,
          origin
        );
      }

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
      const denied = rejectUnknownKeys(data.settings, ALLOWED_APP_SETTING_KEYS);
      if (denied) return errorResp(denied, 400, origin);
      const entries = Object.entries(data.settings);
      for (const [key, value] of entries) {
        await admin
          .from("app_settings")
          .upsert({ key, value }, { onConflict: "key" });
      }
      return successResp({ message: "App settings saved" }, origin);
    }
    case "save_system_settings": {
      const denied = rejectUnknownKeys(data.settings, ALLOWED_SYSTEM_SETTING_KEYS);
      if (denied) return errorResp(denied, 400, origin);
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
