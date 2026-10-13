// Settings access rules shared by every Edge Function that touches
// system_settings / app_settings.
//
// Two distinct audiences:
//   * admins          — read everything except secrets (secrets are
//                       returned masked, never raw);
//   * any authenticated user — read an explicit allow-list only.
//
// The allow-list is DEFAULT-DENY. Migration 030 applied the same rule
// to app_settings (PostgREST); this file applies it to the Edge
// Functions, which read through the service role and therefore bypass
// RLS entirely. Anything not listed stays server-side.

// Never returned to ANY caller, in either table, in any form.
export const SENSITIVE_KEYS = [
  "resend_api_key",
  "sms_api_key",
  "vapid_private_key",
  "smtp_pass",
  "smtp_user",
] as const;

const SENSITIVE_KEY_SET: ReadonlySet<string> = new Set(SENSITIVE_KEYS);

// Keys a non-admin caller may read from system_settings. Every consumer
// (DashboardLayout, AdminLayout, database.ts) reads only the WhatsApp
// block; nothing else in system_settings is used client-side.
export const PUBLIC_SYSTEM_SETTING_KEYS = [
  "whatsapp_enabled",
  "whatsapp_user_number",
  "whatsapp_agent_number",
  "whatsapp_user_message",
  "whatsapp_agent_message",
] as const;

const PUBLIC_SYSTEM_SETTING_KEY_SET: ReadonlySet<string> = new Set(
  PUBLIC_SYSTEM_SETTING_KEYS
);

export function isSensitiveKey(key: string | null | undefined): boolean {
  return Boolean(key) && SENSITIVE_KEY_SET.has(key as string);
}

export function isPublicSystemSettingKey(key: string | null | undefined): boolean {
  return Boolean(key) && PUBLIC_SYSTEM_SETTING_KEY_SET.has(key as string);
}

type Keyed = { key?: string | null; setting_name?: string | null };

function rowKey(row: Keyed): string {
  return (row.key ?? row.setting_name ?? "").trim();
}

// Drop sensitive rows entirely — never redact in place, because a
// partially-redacted row still confirms a key exists and invites
// guessing.
export function redactSensitiveRows<T extends Keyed>(rows: T[]): T[] {
  return rows.filter((r) => !isSensitiveKey(rowKey(r)));
}

// Default-deny filter for non-admin reads of system_settings.
export function publicSystemSettingsOnly<T extends Keyed>(rows: T[]): T[] {
  return rows.filter((r) => {
    const k = rowKey(r);
    return isPublicSystemSettingKey(k) && !isSensitiveKey(k);
  });
}

// Mask an API key for the admin UI: "configured, ends in xxxx".
// The raw value never leaves the server.
export function maskKey(v: string | null | undefined): string {
  if (!v) return "";
  return v.length > 8 ? `configured, ends in ${v.slice(-4)}` : "configured";
}
