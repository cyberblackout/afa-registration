// Shared email helper — single source of truth for Resend sending.
// Used by: send-email, admin-registrations, auth-send-email, admin-settings
// (test send). No duplicate Resend logic anywhere else.
//
// Config lives in system_settings (admin-only RLS). The API key is
// write-only: it is never returned by any endpoint (masked on read).

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

  const apiKey = map.get("resend_api_key")?.trim() ?? "";
  const enabled = (map.get("email_enabled") ?? "false").toLowerCase() === "true";
  const fromName = map.get("email_from_name")?.trim() || "MTN AFA Portal";
  const fromEmail = map.get("email_from")?.trim() || "";
  const replyTo = map.get("email_reply_to")?.trim() || null;

  if (!apiKey) return { error: "Resend API key not configured" };
  if (!enabled) return { error: "Email sending is disabled in settings" };
  if (!fromEmail) return { error: "From email not configured" };

  // Compose RFC 5322 from header: "Name <email>"
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

// Check whether the Resend sending domain is verified. Used by the
// admin-settings "email_status" action. Returns null if the domain
// list cannot be fetched (e.g. invalid key).
export async function checkResendDomainStatus(
  apiKey: string,
  fromEmail: string
): Promise<{ domain: string; verified: boolean } | null> {
  const domain = fromEmail.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  try {
    const res = await fetch(`${RESENDS_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const domains: Array<{ domain: string; status: string }> = data?.data ?? [];
    const match = domains.find((d) => d.domain.toLowerCase() === domain);
    return { domain, verified: match?.status === "verified" };
  } catch {
    return null;
  }
}
