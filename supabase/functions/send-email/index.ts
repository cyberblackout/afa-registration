import { verifyAuth, getSupabaseAdmin, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";
import { loadEmailConfig, sendViaResend, isValidEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }
  if (req.method !== "POST") return errorResp("Method not allowed", 405, origin);
  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResp("Invalid request body", 400, origin);
  }
  const to = typeof body.to === "string" ? body.to : undefined;
  const subject = typeof body.subject === "string" ? body.subject : undefined;
  const html = typeof body.html === "string" ? body.html : undefined;
  const type = typeof body.type === "string" ? body.type : "transactional";
  const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
  if (!to || !subject || !html) {
    return errorResp("to, subject, and html are required", 400, origin);
  }
  if (!isValidEmail(to)) {
    return errorResp("Invalid email address", 400, origin);
  }
  const admin = getSupabaseAdmin();
  // Check notification preferences if user_id provided
  if (user_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("notification_preferences")
      .eq("id", user_id)
      .single();
    const prefs = profile?.notification_preferences || {};
    if (prefs.email === false) {
      return successResp({ skipped: true, reason: "user_opted_out" }, origin);
    }
    if (type === "marketing" && prefs.marketing === false) {
      return successResp({ skipped: true, reason: "marketing_opted_out" }, origin);
    }
  }
  // Rate limit: max 10 emails per minute per admin
  const { data: rateLimit } = await admin.rpc("check_rate_limit", {
    p_key: `email:${auth.user!.id}`,
    p_action: "send_email",
    p_window_seconds: 60,
    p_max_attempts: 10,
  });
  if (rateLimit === false) {
    return errorResp("Rate limit exceeded. Please wait before sending more emails.", 429, origin);
  }
  // Load Resend config from system_settings (single source of truth)
  const loaded = await loadEmailConfig(admin);
  if (loaded.error) {
    return errorResp(loaded.error, 500, origin);
  }
  const config = loaded.config;
  // Create pending log entry
  const { data: logEntry } = await admin
    .from("notifications_log")
    .insert({
      user_id: user_id || null,
      channel: "email",
      recipient: to,
      subject,
      body: html,
      status: "pending",
      is_marketing: type === "marketing",
    })
    .select("id")
    .single();
  // Send via shared helper (no duplicate Resend logic)
  const result = await sendViaResend(config, { to, subject, html });
  if (!result.ok) {
    if (logEntry) {
      await admin
        .from("notifications_log")
        .update({ status: "failed", error_message: result.error || "send failed" })
        .eq("id", logEntry.id);
    }
    return errorResp(result.error || "Email send failed", 502, origin);
  }
  if (logEntry) {
    await admin
      .from("notifications_log")
      .update({
        status: "sent",
        provider_message_id: result.id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", logEntry.id);
  }
  return successResp({ id: result.id, status: "sent" }, origin);
});
