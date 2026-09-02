import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResp as sharedJsonResp, errorResp, successResp } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function getCors(origin: string | null): Record<string, string> {
  return getCorsHeaders(origin);
}

function jsonResp(data: unknown, status: number, origin: string | null): Response {
  return sharedJsonResp(data, status, origin);
}

async function verifyUser(req: Request): Promise<{ id: string; email: string; role: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return { id: user.id, email: user.email ?? "", role: profile.role };
}

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
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "TTL": "86400",
    },
    body,
  });

  return { status: res.status, body: await res.text() };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCors(origin) });
  }
  if (req.method !== "POST") return errorResp("Method not allowed", 405, origin);

  const user = await verifyUser(req);
  if (!user) return errorResp("Unauthorized", 401, origin);
  if (user.role !== "admin" && user.role !== "user" && user.role !== "agent") {
    return errorResp("Insufficient permissions", 403, origin);
  }

  // Rate limit: max 5 push sends per minute per user
  const admin = getAdmin();
  const { data: rateLimit } = await admin.rpc("check_rate_limit", {
    p_key: `push:${user.id}`,
    p_action: "send_push",
    p_window_seconds: 60,
    p_max_attempts: 5,
  });
  if (rateLimit === false) {
    return errorResp("Rate limit exceeded. Please wait before sending more notifications.", 429, origin);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResp("Invalid request body", 400, origin);
  }

  const targetUserId: string | undefined = body.user_id;
  const title: string | undefined = body.title;
  const notifBody: string = body.body || "";
  const targetUrl: string = body.url || "";
  const notifType: string = body.type || "transactional";

  if (!title) {
    return errorResp("title is required", 400, origin);
  }

  // Authorization: non-admins can only send push to themselves
  if (targetUserId && targetUserId !== user.id && user.role !== "admin") {
    return errorResp("You can only send notifications to yourself", 403, origin);
  }

  if (targetUserId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("notification_preferences")
      .eq("id", targetUserId)
      .single();

    const prefs = profile?.notification_preferences || {};
    if (prefs.push === false) {
      return successResp({ skipped: true, reason: "user_opted_out" }, origin);
    }
    if (notifType === "marketing" && prefs.marketing === false) {
      return successResp({ skipped: true, reason: "marketing_opted_out" }, origin);
    }
  }

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

  if (!vapidPublicKey || !vapidPrivateKey) {
    return errorResp("VAPID keys not configured", 500, origin);
  }

  const targetUserIds: string[] = [];
  if (targetUserId) {
    targetUserIds.push(targetUserId);
  } else {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id")
      .eq("notification_preferences->>'push', " + "'true'" + ")");
    if (profiles) {
      for (const p of profiles) {
        targetUserIds.push(p.id);
      }
    }
  }

  if (targetUserIds.length === 0) {
    return successResp({ sent: 0, reason: "no_recipients" }, origin);
  }

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh_key, auth_key")
    .in("user_id", targetUserIds);

  if (!subscriptions || subscriptions.length === 0) {
    return successResp({ sent: 0, reason: "no_subscriptions" }, origin);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    const { data: logEntry } = await admin
      .from("notifications_log")
      .insert({
        user_id: sub.user_id,
        channel: "push",
        recipient: sub.endpoint.slice(0, 50),
        subject: title,
        body: notifBody || title,
        status: "pending",
        is_marketing: notifType === "marketing",
      })
      .select("id")
      .single();

    try {
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh_key,
        sub.auth_key,
        JSON.stringify({ title, body: notifBody || title, url: targetUrl || "/dashboard" }),
        vapidPublicKey,
        vapidPrivateKey,
      );

      if (result.status >= 200 && result.status < 300) {
        sentCount++;
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
        failedCount++;
        if (logEntry) {
          await admin
            .from("notifications_log")
            .update({
              status: "failed",
              provider_response: { status: result.status, body: result.body },
              error_message: "Push failed with status " + result.status,
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
      failedCount++;
      if (logEntry) {
        await admin
          .from("notifications_log")
          .update({
            status: "failed",
            error_message: String(err),
          })
          .eq("id", logEntry.id);
      }
    }
  }

  return successResp({ sent: sentCount, failed: failedCount }, origin);
});
