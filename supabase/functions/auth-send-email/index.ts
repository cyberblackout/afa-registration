// auth-send-email — Supabase Auth "Send Email Hook" endpoint.
//
// Supabase POSTs a Standard Webhooks-signed payload here for every
// auth email (signup, recovery, magiclink, invite, email_change,
// reauthentication + security notifications). We verify the signature,
// build the verify link ONLY from the signed payload, render a branded
// template, and send via Resend using config from system_settings.
//
// Security:
//   - Deployed with --no-verify-jwt (hook fires before a JWT exists).
//     Authenticity is the Standard Webhooks signature; anything
//     unsigned/invalid is 401 before any data is read.
//   - The confirm link is built from email_data.token_hash /
//     email_data.redirect_to / email_data.site_url (all inside the
//     signed body). We never build a link from request input.
//   - Tokens, links and the API key are never logged.
//   - On Resend failure we return a generic error to Supabase and log
//     only a safe reason.
//
// Rollback: disable the hook in the Supabase Dashboard → Auth returns
// to the configured SMTP sender.

import { Webhook } from "npm:standardwebhooks@^1";
import { getSupabaseAdmin } from "../_shared/auth.ts";
import { loadEmailConfig, sendViaResend } from "../_shared/email.ts";

interface HookUser {
  id: string;
  email: string;
  new_email?: string;
  user_metadata?: Record<string, unknown>;
}

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
  old_email?: string;
}

interface HookPayload {
  user: HookUser;
  email_data: EmailData;
}

// Build the Supabase verify URL from the SIGNED payload only.
// Mirrors the documented pattern:
//   {SUPABASE_URL}/auth/v1/verify?token={token_hash}&type={type}&redirect_to={redirect_to}
function buildVerifyUrl(tokenHash: string, actionType: string, redirectTo: string): string {
  const base = `${Deno.env.get("SUPABASE_URL") ?? ""}/auth/v1/verify`;
  const params = new URLSearchParams({
    token: tokenHash,
    type: actionType,
    redirect_to: redirectTo,
  });
  return `${base}?${params.toString()}`;
}

// Minimal branded HTML wrapper. App name / support come from settings
// at call time (never hardcoded sender identity in the link itself).
function wrapHtml(title: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <h1 style="font-size:20px;color:#111;margin:0 0 16px;">${title}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#777;margin-top:32px;">${footerNote}</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  // Server-to-server only. No CORS, no JWT — signature is the gate.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { http_code: 405, message: "Method not allowed" } }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  if (!secret) {
    // Misconfiguration: fail closed. Safe log only.
    console.error("auth-send-email: SEND_EMAIL_HOOK_SECRET not set");
    return new Response(JSON.stringify({ error: { http_code: 500, message: "Hook not configured" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payloadText = await req.text();
  const headers = Object.fromEntries(req.headers);

  // Standard Webhooks verification. The secret is "v1,whsec_<base64>";
  // the library expects the raw base64 portion.
  let payload: HookPayload;
  try {
    const base64Secret = secret.replace("v1,whsec_", "");
    const wh = new Webhook(base64Secret);
    payload = wh.verify(payloadText, headers) as HookPayload;
  } catch {
    // 401 before touching any data. No details leaked.
    return new Response(JSON.stringify({ error: { http_code: 401, message: "Invalid signature" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { user, email_data } = payload;
  if (!user?.email && !user?.new_email) {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "No recipient" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Load Resend config (service-role read of system_settings).
  const admin = getSupabaseAdmin();
  const loaded = await loadEmailConfig(admin);
  if (loaded.error) {
    // Config missing/disabled — return generic error so Supabase logs
    // it; do not crash. Safe reason only.
    console.error("auth-send-email: config error:", loaded.error);
    return new Response(JSON.stringify({ error: { http_code: 500, message: "Email not configured" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const config = loaded.config;

  // Fetch app branding (name / support) from app_settings — non-secret.
  const { data: brandingRows } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["site_name", "support_email"]);
  const branding = new Map<string, string>();
  for (const r of brandingRows ?? []) branding.set(r.key, r.value ?? "");
  const appName = branding.get("site_name") || config.fromName || "MTN AFA Portal";
  const supportEmail = branding.get("support_email") || config.replyTo || "";
  const footer = supportEmail
    ? `If you didn't request this, you can safely ignore this email. Contact ${escapeHtml(supportEmail)} for help.`
    : "If you didn't request this, you can safely ignore this email.";

  const action = email_data.email_action_type;
  const displayName = (user.user_metadata?.full_name as string) || user.email || "";

  // Per-action rendering. Every branch builds the link from the SIGNED
  // token_hash + redirect_to + type. No request input is trusted.
  type Out = { to: string[]; subject: string; html: string };
  const out: Out[] = [];

  switch (action) {
    case "signup": {
      const link = buildVerifyUrl(email_data.token_hash, "signup", email_data.redirect_to);
      out.push({
        to: [user.email],
        subject: `Confirm your email address — ${appName}`,
        html: wrapHtml(
          `Welcome to ${escapeHtml(appName)}`,
          `<p>Hi${displayName ? " " + escapeHtml(displayName) : ""},</p>
           <p>Confirm your email address to finish signing up.</p>
           <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirm email address</a></p>
           <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>`,
          footer
        ),
      });
      break;
    }
    case "recovery": {
      const link = buildVerifyUrl(email_data.token_hash, "recovery", email_data.redirect_to);
      out.push({
        to: [user.email],
        subject: `Reset your password — ${appName}`,
        html: wrapHtml(
          `Reset your ${escapeHtml(appName)} password`,
          `<p>Hi${displayName ? " " + escapeHtml(displayName) : ""},</p>
           <p>We received a request to reset your password. Choose a new one using the link below.</p>
           <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
           <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>`,
          footer
        ),
      });
      break;
    }
    case "magiclink": {
      const link = buildVerifyUrl(email_data.token_hash, "magiclink", email_data.redirect_to);
      out.push({
        to: [user.email],
        subject: `Your sign-in link — ${appName}`,
        html: wrapHtml(
          `Sign in to ${escapeHtml(appName)}`,
          `<p>Use the link below to sign in. It expires shortly and can only be used once.</p>
           <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Sign in</a></p>
           <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>`,
          footer
        ),
      });
      break;
    }
    case "invite": {
      const link = buildVerifyUrl(email_data.token_hash, "invite", email_data.redirect_to);
      out.push({
        to: [user.email],
        subject: `You've been invited to ${appName}`,
        html: wrapHtml(
          `You're invited`,
          `<p>You've been invited to create an account on ${escapeHtml(appName)}.</p>
           <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Accept invitation</a></p>
           <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>`,
          footer
        ),
      });
      break;
    }
    case "email_change": {
      // Secure Email Change: token_hash_new ↔ current email (user.email)
      // with token; token_hash ↔ new email (user.new_email) with token_new.
      // (Field names are reversed for backward compatibility — see docs.)
      const secure = Boolean(email_data.token_hash_new && email_data.token_hash && user.new_email);
      if (secure) {
        const linkCurrent = buildVerifyUrl(email_data.token_hash_new, "email_change", email_data.redirect_to);
        out.push({
          to: [user.email],
          subject: `Confirm your new email address — ${appName}`,
          html: wrapHtml(
            `Confirm your new email address`,
            `<p>A change to your email address was requested.</p>
             <p><a href="${escapeHtml(linkCurrent)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirm new email address</a></p>
             <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(linkCurrent)}</span></p>`,
            footer
          ),
        });
        const linkNew = buildVerifyUrl(email_data.token_hash, "email_change", email_data.redirect_to);
        out.push({
          to: [user.new_email!],
          subject: `Confirm your new email address — ${appName}`,
          html: wrapHtml(
            `Confirm your new email address`,
            `<p>A change to your email address was requested.</p>
             <p><a href="${escapeHtml(linkNew)}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirm new email address</a></p>
             <p style="font-size:14px;color:#555;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(linkNew)}</span></p>`,
            footer
          ),
        });
      } else {
        // Non-secure: single OTP to the new email. token_hash may be empty
        // for anonymous-user edge cases (supabase/auth#2042) — fall back to
        // token_new/token_hash_new if present.
        const hash = email_data.token_hash || email_data.token_hash_new;
        const tok = email_data.token || email_data.token_new;
        const target = user.new_email || user.email;
        if (!hash && !tok) {
          // Nothing to send — acknowledge so Supabase doesn't retry.
          break;
        }
        const body = hash
          ? `<p>Confirm your new email address.</p>
             <p><a href="${escapeHtml(buildVerifyUrl(hash, "email_change", email_data.redirect_to))}" style="display:inline-block;background:#ffcc00;color:#111;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirm new email address</a></p>`
          : `<p>Use this code to confirm your new email address:</p>
             <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${escapeHtml(tok)}</p>`;
        out.push({
          to: [target],
          subject: `Confirm your new email address — ${appName}`,
          html: wrapHtml(`Confirm your new email address`, body, footer),
        });
      }
      break;
    }
    case "reauthentication": {
      // OTP only — no link. Show the code.
      out.push({
        to: [user.email],
        subject: `Your verification code — ${appName}`,
        html: wrapHtml(
          `Your verification code`,
          `<p>Use the code below to verify your identity. It expires shortly.</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${escapeHtml(email_data.token || "")}</p>`,
          footer
        ),
      });
      break;
    }
    // Security notifications — no token, simple notice.
    case "password_changed_notification": {
      out.push({
        to: [user.email],
        subject: `Your password was changed — ${appName}`,
        html: wrapHtml(
          `Password changed`,
          `<p>The password for your ${escapeHtml(appName)} account was changed.</p>
           <p>If you didn't make this change, contact support immediately.</p>`,
          footer
        ),
      });
      break;
    }
    case "email_changed_notification": {
      out.push({
        to: [user.email],
        subject: `Your email address was changed — ${appName}`,
        html: wrapHtml(
          `Email changed`,
          `<p>The email address for your ${escapeHtml(appName)} account was changed${email_data.old_email ? ` from ${escapeHtml(email_data.old_email)}` : ""}.</p>
           <p>If you didn't make this change, contact support immediately.</p>`,
          footer
        ),
      });
      break;
    }
    case "phone_changed_notification": {
      out.push({
        to: [user.email],
        subject: `Your phone number was changed — ${appName}`,
        html: wrapHtml(
          `Phone number changed`,
          `<p>The phone number for your ${escapeHtml(appName)} account was changed.</p>
           <p>If you didn't make this change, contact support immediately.</p>`,
          footer
        ),
      });
      break;
    }
    default:
      // Unknown action type — acknowledge without sending so Supabase
      // does not retry. Safe log only (action name, no tokens).
      console.warn("auth-send-email: unhandled action type:", action);
      break;
  }

  if (out.length === 0) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Send each message. Log only safe reasons (never tokens/links/keys).
  let anyFailure = false;
  for (const m of out) {
    const result = await sendViaResend(config, { to: m.to, subject: m.subject, html: m.html });
    if (!result.ok) {
      anyFailure = true;
      console.error("auth-send-email: send failed:", result.error, "action:", action);
    }
  }

  if (anyFailure) {
    // Generic error to Supabase (it will surface/log). No internals.
    return new Response(
      JSON.stringify({ error: { http_code: 502, message: "Failed to send email" } }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
