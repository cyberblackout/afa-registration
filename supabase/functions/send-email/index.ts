import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, getSupabaseAdmin, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }
  if (req.method !== "POST") return errorResp("Method not allowed", 405, origin);

  const auth = await verifyAuth(req, ["admin", "user", "agent"]);
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResp("Invalid request body", 400, origin);
  }

  const { to, subject, html, type = "transactional", user_id } = body;
  if (!to || !subject || !html) {
    return errorResp("to, subject, and html are required", 400, origin);
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

  // Get Resend API key from system_settings
  const { data: keyRow } = await admin
    .from("system_settings")
    .select("setting_value")
    .eq("setting_name", "resend_api_key")
    .single();

  const { data: fromRow } = await admin
    .from("system_settings")
    .select("setting_value")
    .eq("setting_name", "email_from")
    .single();

  const apiKey = keyRow?.setting_value;
  const fromEmail = fromRow?.setting_value || "MTN AFA Portal <noreply@afa-portal.com>";

  if (!apiKey) {
    return errorResp("Resend API key not configured", 500, origin);
  }

  // Create pending log entry
  const { data: logEntry, error: logError } = await admin
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

  if (logError) {
    console.error("Failed to create notification log:", logError);
  }

  // Call Resend API
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.id) {
      console.error("Resend API error:", data);
      // Update log as failed
      if (logEntry) {
        await admin
          .from("notifications_log")
          .update({
            status: "failed",
            provider_response: data,
            error_message: data.message || "Resend API error",
          })
          .eq("id", logEntry.id);
      }
      return errorResp(data.message || "Email send failed", 502, origin);
    }

    // Update log as sent
    if (logEntry) {
      await admin
        .from("notifications_log")
        .update({
          status: "sent",
          provider_message_id: data.id,
          provider_response: data,
          sent_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return successResp({ id: data.id, status: "sent" }, origin);
  } catch (err) {
    console.error("Email send error:", err);
    if (logEntry) {
      await admin
        .from("notifications_log")
        .update({
          status: "failed",
          error_message: String(err),
        })
        .eq("id", logEntry.id);
    }
    return errorResp("Email service temporarily unavailable", 500, origin);
  }
});
