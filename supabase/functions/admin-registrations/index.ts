import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    status: z.string().optional(),
    user_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    id: z.string().uuid(),
    status: z.string().min(1),
    admin_notes: z.string().optional(),
    user_message: z.string().optional(),
  }),
  z.object({
    action: z.literal("bulk_update"),
    ids: z.array(z.string().uuid()).min(1),
    status: z.string().min(1),
  }),
  z.object({
    action: z.literal("add_timeline"),
    registration_id: z.string().uuid(),
    status: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("assign_admin"),
    id: z.string().uuid(),
    admin_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("add_document"),
    registration_id: z.string().uuid(),
    document_type: z.string().min(1),
    document_url: z.string().min(1),
    file_name: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_document_status"),
    id: z.string().uuid(),
    status: z.string().min(1),
    admin_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("process_referral_reward"),
    registration_id: z.string().uuid(),
  }),
]);

// ── Notification helpers ──────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  processing: "Under Processing",
  document_verification: "Document Verification",
  approved: "Approved",
  completed: "Completed",
  rejected: "Not Approved",
  cancelled: "Cancelled",
};

function buildEmailSubject(status: string): string {
  switch (status) {
    case "approved":
    case "completed":
      return "Your AFA Registration Has Been Approved";
    case "rejected":
      return "Update on Your AFA Registration";
    case "processing":
      return "Your AFA Registration Is Being Processed";
    default:
      return "Registration Status Update";
  }
}

function buildEmailHtml(
  name: string,
  regNumber: string,
  status: string,
  userMessage?: string | null,
): string {
  const statusColors: Record<string, string> = {
    pending: "#f59e0b",
    processing: "#2563eb",
    document_verification: "#8b5cf6",
    approved: "#059669",
    completed: "#059669",
    rejected: "#dc2626",
    cancelled: "#6b7280",
  };
  const label = STATUS_LABELS[status] || status;
  const color = statusColors[status] || "#6b7280";

  let bodyText = "";
  let defaultMsg = "";

  if (status === "approved" || status === "completed") {
    defaultMsg =
      "Your registration is now complete. You can log in to your dashboard to view your registration details and access all available features.";
    bodyText = userMessage
      ? `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6"><strong>Additional information:</strong> ${userMessage}</p>`
      : `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6">${defaultMsg}</p>`;
  } else if (status === "rejected") {
    defaultMsg =
      "We were unable to verify the information provided. Please review your submission details and, if needed, submit a new registration with updated information.";
    bodyText = userMessage
      ? `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6"><strong>Reason:</strong> ${userMessage}</p>`
      : `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6">${defaultMsg}</p>`;
    bodyText += `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6">If you have questions or believe this was an error, please contact our support team.</p>`;
  } else if (status === "processing") {
    defaultMsg =
      "Our team is reviewing your submission. We'll notify you once a decision has been made. This typically takes 1\u20133 business days.";
    bodyText = userMessage
      ? `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6"><strong>Note:</strong> ${userMessage}</p>`
      : `<p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.6">${defaultMsg}</p>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#FFCB05;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">MTN AFA Portal</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px">
            <h2 style="color:#1a1a2e;margin:0 0 6px;font-size:20px;font-weight:600">${buildEmailSubject(status)}</h2>
            <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.5">Hi <strong style="color:#1a1a2e">${name}</strong>,</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:20px;margin:0 0 20px;text-align:center">
              <tr><td style="padding:0 0 8px;color:#6b7280;font-size:13px">Current Status</td></tr>
              <tr><td style="padding:0"><span style="display:inline-block;background:${color}15;color:${color};padding:6px 20px;border-radius:20px;font-weight:700;font-size:14px">${label}</span></td></tr>
            </table>
            ${bodyText}
            <p style="color:#9ca3af;margin:0 0 4px;font-size:12px">Reference: ${regNumber}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;margin:0;font-size:11px;text-align:center">MTN AFA Registration Portal &middot; <a href="#" style="color:#9ca3af;text-decoration:underline">Support</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildSmsMessage(
  regNumber: string,
  status: string,
  userMessage?: string | null,
): string {
  const suffix = userMessage ? ` ${userMessage}` : "";
  switch (status) {
    case "approved":
    case "completed":
      return `MTN AFA: Your registration #${regNumber} has been approved! Log in to your dashboard for details.${suffix}`;
    case "rejected":
      return `MTN AFA: Your registration #${regNumber} could not be approved.${suffix} Contact support if you have questions.`;
    case "processing":
      return `MTN AFA: Your registration #${regNumber} is being processed. We'll notify you once complete.${suffix}`;
    default:
      return `MTN AFA: Your registration #${regNumber} status has been updated to "${STATUS_LABELS[status] || status}".${suffix}`;
  }
}

function buildPushPayload(
  regNumber: string,
  status: string,
): { title: string; body: string } {
  switch (status) {
    case "approved":
    case "completed":
      return {
        title: "Registration Approved",
        body: `Your AFA registration #${regNumber} has been approved.`,
      };
    case "rejected":
      return {
        title: "Registration Update",
        body: `Your AFA registration #${regNumber} could not be approved. Check your notifications for details.`,
      };
    case "processing":
      return {
        title: "Registration Processing",
        body: `Your AFA registration #${regNumber} is being processed.`,
      };
    default:
      return {
        title: "Registration Status Update",
        body: `Your AFA registration #${regNumber} status has been updated.`,
      };
  }
}

function getNotificationType(
  status: string,
): "success" | "error" | "info" {
  if (status === "approved" || status === "completed") return "success";
  if (status === "rejected") return "error";
  return "info";
}

// ── Send notification to all enabled channels ─────────────────

async function sendRegistrationStatusNotifications(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  regNumber: string,
  status: string,
  userMessage?: string | null,
): Promise<void> {
  // 1. Fetch user profile
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email, phone, notification_preferences")
    .eq("id", userId)
    .single();

  if (!profile) return;

  const prefs = profile.notification_preferences || {};
  const userName = profile.full_name || "User";
  const notifType = getNotificationType(status);

  // 2. In-app notification (always)
  const inAppTitle = buildEmailSubject(status);
  const inAppMessage = userMessage
    ? `${buildSmsMessage(regNumber, status, userMessage).replace("MTN AFA: ", "")}`
    : `${buildSmsMessage(regNumber, status).replace("MTN AFA: ", "")}`;

  await admin.from("notifications").insert({
    user_id: userId,
    title: inAppTitle,
    message: inAppMessage,
    type: notifType,
  });

  // 3. Email
  if (profile.email && prefs.email !== false) {
    const subject = buildEmailSubject(status);
    const html = buildEmailHtml(userName, regNumber, status, userMessage);

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

    if (apiKey) {
      const { data: logEntry } = await admin
        .from("notifications_log")
        .insert({
          user_id: userId,
          channel: "email",
          recipient: profile.email,
          subject,
          body: html,
          status: "pending",
          is_marketing: false,
        })
        .select("id")
        .single();

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [profile.email],
            subject,
            html,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.id) {
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
        } else {
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
        }
      } catch (err) {
        if (logEntry) {
          await admin
            .from("notifications_log")
            .update({ status: "failed", error_message: String(err) })
            .eq("id", logEntry.id);
        }
      }
    }
  }

  // 4. SMS
  if (profile.phone && prefs.sms !== false) {
    const message = buildSmsMessage(regNumber, status, userMessage);

    const { data: urlRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_name", "sms_api_url")
      .single();
    const { data: keyRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_name", "sms_api_key")
      .single();
    const { data: senderRow } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_name", "sms_sender_id")
      .single();

    const apiUrl = urlRow?.setting_value;
    const apiKey = keyRow?.setting_value;
    const senderId = senderRow?.setting_value || "MTN AFA";

    if (apiUrl && apiKey) {
      const { data: logEntry } = await admin
        .from("notifications_log")
        .insert({
          user_id: userId,
          channel: "sms",
          recipient: profile.phone,
          body: message,
          status: "pending",
          is_marketing: false,
        })
        .select("id")
        .single();

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: profile.phone,
            from: senderId,
            content: message,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (logEntry) {
            await admin
              .from("notifications_log")
              .update({
                status: "failed",
                provider_response: data,
                error_message: data.message || "SMS API error",
              })
              .eq("id", logEntry.id);
          }
        } else {
          if (logEntry) {
            await admin
              .from("notifications_log")
              .update({
                status: "sent",
                provider_message_id: data.id || data.messageId || null,
                provider_response: data,
                sent_at: new Date().toISOString(),
              })
              .eq("id", logEntry.id);
          }
        }
      } catch (err) {
        if (logEntry) {
          await admin
            .from("notifications_log")
            .update({ status: "failed", error_message: String(err) })
            .eq("id", logEntry.id);
        }
      }
    }
  }

  // 5. Push
  if (prefs.push !== false) {
    const pushPayload = buildPushPayload(regNumber, status);

    const { data: pubKeyRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "vapid_public_key")
      .single();
    const { data: privKeyRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "vapid_private_key")
      .single();

    const vapidPublicKey = pubKeyRow?.value;
    const vapidPrivateKey = privKeyRow?.value;

    if (vapidPublicKey && vapidPrivateKey) {
      const { data: subscriptions } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh_key, auth_key")
        .eq("user_id", userId);

      if (subscriptions && subscriptions.length > 0) {
        for (const sub of subscriptions) {
          const { data: logEntry } = await admin
            .from("notifications_log")
            .insert({
              user_id: userId,
              channel: "push",
              recipient: sub.endpoint.slice(0, 50),
              subject: pushPayload.title,
              body: pushPayload.body,
              status: "pending",
              is_marketing: false,
            })
            .select("id")
            .single();

          try {
            const result = await sendWebPush(
              sub.endpoint,
              sub.p256dh_key,
              sub.auth_key,
              JSON.stringify({ title: pushPayload.title, body: pushPayload.body, url: "/register-afa" }),
              vapidPublicKey,
              vapidPrivateKey,
            );

            if (result.status >= 200 && result.status < 300) {
              if (logEntry) {
                await admin
                  .from("notifications_log")
                  .update({
                    status: "sent",
                    provider_response: { status: result.status },
                    sent_at: new Date().toISOString(),
                  })
                  .eq("id", logEntry.id);
              }
            } else {
              if (logEntry) {
                await admin
                  .from("notifications_log")
                  .update({
                    status: "failed",
                    provider_response: { status: result.status, body: result.body },
                    error_message: `Push failed with status ${result.status}`,
                  })
                  .eq("id", logEntry.id);
              }
              if (result.status === 404 || result.status === 410) {
                await admin
                  .from("push_subscriptions")
                  .delete()
                  .eq("endpoint", sub.endpoint);
              }
            }
          } catch (err) {
            if (logEntry) {
              await admin
                .from("notifications_log")
                .update({ status: "failed", error_message: String(err) })
                .eq("id", logEntry.id);
            }
          }
        }
      }
    }
  }
}

// ── Web Push helper (VAPID) ───────────────────────────────────

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<{ status: number; body: string }> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    aud: new URL(endpoint).origin,
    exp: now + 43200,
    sub: "mailto:admin@afa-portal.com",
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const claimB64 = btoa(JSON.stringify(claim))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const signingInput = encoder.encode(`${headerB64}.${claimB64}`);

  const privKeyBytes = Uint8Array.from(
    atob(vapidPrivateKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privKeyBytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    signingInput,
  );

  const sigBytes = new Uint8Array(signature);
  const rLen = sigBytes[3];
  const r = sigBytes.slice(4, 4 + rLen);
  const s = sigBytes.slice(4 + rLen + 2);
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  rPadded.set(r.slice(Math.max(0, r.length - 32)), Math.max(0, 32 - r.length));
  sPadded.set(s.slice(Math.max(0, s.length - 32)), Math.max(0, 32 - s.length));
  const rawSignature = new Uint8Array(64);
  rawSignature.set(rPadded);
  rawSignature.set(sPadded, 32);

  const signatureB64 = btoa(String.fromCharCode(...rawSignature))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${headerB64}.${claimB64}.${signatureB64}`;

  const parsedPayload = JSON.parse(payload);
  const body = JSON.stringify({
    title: parsedPayload.title || "MTN AFA",
    body: parsedPayload.body || "",
    data: { url: parsedPayload.url || "/dashboard" },
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      TTL: "86400",
    },
    body,
  });

  return { status: res.status, body: await res.text() };
}

// ── Main handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    const admin = getSupabaseAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const userId = url.searchParams.get("user_id");

    let query = admin
      .from("registrations")
      .select("*, registration_documents(*), registration_timeline(*), profiles!registrations_user_id_fkey(full_name, email, phone, role, username)")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) return errorResp("Failed to fetch registrations", 500, origin);
    return successResp(data, origin);
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
    case "update_status": {
      const updatePayload: Record<string, unknown> = {
        status: data.status,
        admin_notes: data.admin_notes,
      };
      if (data.user_message !== undefined) {
        updatePayload.user_message = data.user_message;
      }

      const { error } = await admin
        .from("registrations")
        .update(updatePayload)
        .eq("id", data.id);
      if (error) return errorResp("Failed to update status", 500, origin);

      // Timeline entry
      await admin.from("registration_timeline").insert({
        registration_id: data.id,
        changed_by: auth.user!.id,
        status: data.status,
        note: data.admin_notes || `Status updated to ${data.status}`,
      });

      // Fetch registration to get user_id and reg_number
      const { data: registration } = await admin
        .from("registrations")
        .select("user_id, reg_number")
        .eq("id", data.id)
        .single();

      // Send notifications (non-blocking — fire and forget)
      if (registration?.user_id) {
        const regNumber = registration.reg_number || data.id.slice(0, 8);
        sendRegistrationStatusNotifications(
          admin,
          registration.user_id,
          regNumber,
          data.status,
          data.user_message,
        ).catch((err) => {
          console.error("Notification send error:", err);
        });

        // Process referral reward when registration is completed
        if (data.status === "completed") {
          try {
            const { data: reward } = await admin.rpc("process_referral_reward", {
              registration_id: data.id,
            });
            if (reward?.success && reward?.referrer_id) {
              await admin.from("notifications").insert({
                user_id: reward.referrer_id,
                title: "Referral Reward Earned!",
                message: `You earned GH\u20B5 ${reward.amount} from a successful registration referral.`,
                type: "success",
              });
            }
          } catch {
            // referral reward processing is non-critical
          }
        }
      }

      return successResp({ message: "Status updated" }, origin);
    }

    case "bulk_update": {
      const { error } = await admin
        .from("registrations")
        .update({ status: data.status })
        .in("id", data.ids);
      if (error) return errorResp("Bulk update failed", 500, origin);

      const timelineEntries = data.ids.map((id) => ({
        registration_id: id,
        changed_by: auth.user!.id,
        status: data.status,
        note: `Bulk status update to ${data.status}`,
      }));
      await admin.from("registration_timeline").insert(timelineEntries);

      // Send notifications for each registration (fire and forget)
      for (const id of data.ids) {
        const { data: reg } = await admin
          .from("registrations")
          .select("user_id, reg_number")
          .eq("id", id)
          .single();
        if (reg?.user_id) {
          const regNumber = reg.reg_number || id.slice(0, 8);
          sendRegistrationStatusNotifications(
            admin,
            reg.user_id,
            regNumber,
            data.status,
          ).catch((err) => {
            console.error("Bulk notification error:", err);
          });
        }
      }

      return successResp({ message: `${data.ids.length} registrations updated` }, origin);
    }

    case "add_timeline": {
      const { error } = await admin.from("registration_timeline").insert({
        registration_id: data.registration_id,
        changed_by: auth.user!.id,
        status: data.status,
        note: data.note,
      });
      if (error) return errorResp("Failed to add timeline entry", 500, origin);
      return successResp({ message: "Timeline entry added" }, origin);
    }

    case "assign_admin": {
      const { error } = await admin
        .from("registrations")
        .update({ assigned_admin_id: data.admin_id })
        .eq("id", data.id);
      if (error) return errorResp("Failed to assign admin", 500, origin);
      return successResp({ message: "Admin assigned" }, origin);
    }

    case "add_document": {
      const { error } = await admin.from("registration_documents").insert({
        registration_id: data.registration_id,
        document_type: data.document_type,
        document_url: data.document_url,
        file_name: data.file_name || data.document_type,
        status: "pending",
      });
      if (error) return errorResp("Failed to add document", 500, origin);
      return successResp({ message: "Document added" }, origin);
    }

    case "update_document_status": {
      const { error } = await admin
        .from("registration_documents")
        .update({ status: data.status, admin_notes: data.admin_notes })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update document status", 500, origin);
      return successResp({ message: "Document status updated" }, origin);
    }

    case "process_referral_reward": {
      const { data: reward, error } = await admin.rpc("process_referral_reward", {
        registration_id: data.registration_id,
      });
      if (error) {
        console.error("process_referral_reward error:", error);
        return errorResp("Failed to process referral reward", 500, origin);
      }
      return successResp(reward, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
