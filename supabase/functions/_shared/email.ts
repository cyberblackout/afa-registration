// Shared email helper — single source of truth for Resend sending.
// Used by: send-email, admin-registrations, auth-send-email
// (admin-settings no longer sends test mail — it has no email UI).
//
// Config is Supabase-owned, not admin-UI-owned:
//   * secret   → RESEND_API_KEY Edge Function secret (preferred), with
//                system_settings.resend_api_key as a legacy fallback
//   * non-secret → system_settings rows (email_enabled, email_from,
//                email_from_name, email_reply_to), set via SQL/migration
// The API key is never returned by any endpoint and is never logged.

import { getSupabaseAdmin } from "./auth.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailConfig {
  apiKey: string;
  from: string; // "Name <email@domain>"
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  enabled: boolean;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// system_settings keys managed by this module. resend_api_key is the
// only secret; the rest are non-secret and readable by admins.
export const EMAIL_SETTING_KEYS = [
  "resend_api_key",
  "email_from",
  "email_from_name",
  "email_reply_to",
  "email_enabled",
] as const;

const RESENDS_API = "https://api.resend.com";

// Load email config from system_settings via the service-role client.
// Returns null if the key is missing or email is disabled.
export async function loadEmailConfig(
  admin: SupabaseClient = getSupabaseAdmin()
): Promise<{ config: EmailConfig; error?: never } | { config?: never; error: string }> {
  const { data: rows } = await admin
    .from("system_settings")
    .select("setting_name, setting_value")
    .in("setting_name", [...EMAIL_SETTING_KEYS]);

  const map = new Map<string, string>();
  for (const r of rows ?? []) map.set(r.setting_name, r.setting_value ?? "");

  // Secret: Supabase Edge Function secret first, legacy DB row second.
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim() ||
    (map.get("resend_api_key")?.trim() ?? "");
  const enabled = (map.get("email_enabled") ?? "false").toLowerCase() === "true";
  // No hardcoded display name: the sender identity comes from settings
  // only. An empty name produces a bare RFC 5322 address.
  const fromName = map.get("email_from_name")?.trim() ?? "";
  const fromEmail = map.get("email_from")?.trim() || "";
  const replyTo = map.get("email_reply_to")?.trim() || null;

  if (!apiKey) return { error: "Resend API key not configured" };
  if (!enabled) return { error: "Email sending is disabled in settings" };
  if (!fromEmail) return { error: "From email not configured" };

  // Send-time from-domain enforcement. The admin UI that used to check
  // this at save time is gone, so every send is checked here instead —
  // cached per isolate so it costs one Resend call per TTL, not one per
  // recipient. Fails CLOSED when Resend says the domain is unverified,
  // OPEN when Resend cannot be reached (an outage must not block mail).
  if (await isFromDomainVerified(apiKey, fromEmail) === false) {
    return { error: "From email domain is not verified in Resend" };
  }

  // Compose RFC 5322 from header: "Name <email>" or just "email"
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  return {
    config: { apiKey, from, fromName, fromEmail, replyTo, enabled },
  };
}

// Validate an email address format (single address only).
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Send one email via the Resend HTTP API. Throws nothing — returns a
// typed result. Never logs the API key.
export async function sendViaResend(
  config: EmailConfig,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const payload: Record<string, unknown> = {
    from: config.from,
    to,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
  if (config.replyTo) payload.reply_to = config.replyTo;

  try {
    const res = await fetch(`${RESENDS_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      // Safe reason only — no key, no full provider dump.
      return { ok: false, error: data.message || `Resend error ${res.status}` };
    }
    return { ok: true, id: data.id as string };
  } catch {
    return { ok: false, error: "Resend request failed" };
  }
}

// Check whether the Resend sending domain is verified. Called by
// isFromDomainVerified() on the send path so a from-address outside the
// verified domain never reaches Resend.
// Returns null if the domain list cannot be fetched (e.g. invalid key)
// — callers must treat that as "could not verify", never as "ok".
export async function checkResendDomainStatus(
  apiKey: string,
  fromEmail: string
): Promise<{ domain: string; verified: boolean; verifiedDomains: string[] } | null> {
  const domain = fromEmail.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  try {
    const res = await fetch(`${RESENDS_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const domains: Array<{ domain: string; status: string }> = data?.data ?? [];
    const verifiedDomains = domains
      .filter((d) => d.status === "verified")
      .map((d) => d.domain.toLowerCase());
    return {
      domain,
      verified: verifiedDomains.includes(domain),
      verifiedDomains,
    };
  } catch {
    return null;
  }
}

// Cached send-time verification of the from-domain (see loadEmailConfig).
// Returns false only when Resend explicitly says the domain is not
// verified; null/unreachable results are treated as "allow".
let domainCheckAt = 0;
let domainCheckKey = "";
let domainCheckOk = true;
const DOMAIN_CHECK_TTL_MS = 5 * 60 * 1000;

export async function isFromDomainVerified(apiKey: string, fromEmail: string): Promise<boolean> {
  const cacheKey = `${apiKey.length}:${fromEmail.toLowerCase()}`;
  if (cacheKey === domainCheckKey && Date.now() - domainCheckAt < DOMAIN_CHECK_TTL_MS) {
    return domainCheckOk;
  }
  const check = await checkResendDomainStatus(apiKey, fromEmail);
  const ok = check === null ? true : check.verified;
  domainCheckKey = cacheKey;
  domainCheckAt = Date.now();
  domainCheckOk = ok;
  return ok;
}