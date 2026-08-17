import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  jsonResp,
  errorResp,
  successResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get_vapid_key"),
  }),
  z.object({
    action: z.literal("subscribe"),
    endpoint: z.string().url(),
    p256dh_key: z.string().min(1),
    auth_key: z.string().min(1),
  }),
  z.object({
    action: z.literal("unsubscribe"),
  }),
  z.object({
    action: z.literal("check_subscription"),
    endpoint: z.string().url(),
  }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method === "GET") {
    // Get VAPID public key (public endpoint, no auth needed)
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "vapid_key") {
      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .single();
      return successResp({ key: data?.value || null }, origin);
    }

    return errorResp("Invalid action", 400, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "get_vapid_key": {
      const { data: keyData } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .single();
      return successResp({ key: keyData?.value || null }, origin);
    }

    case "check_subscription": {
      const { data: existing } = await admin
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", data.endpoint)
        .single();
      return successResp({ exists: !!existing }, origin);
    }

    case "subscribe": {
      // Check if already subscribed
      const { data: existing } = await admin
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", data.endpoint)
        .single();

      if (!existing) {
        const { error } = await admin.from("push_subscriptions").insert({
          user_id: auth.user!.id,
          endpoint: data.endpoint,
          p256dh_key: data.p256dh_key,
          auth_key: data.auth_key,
        });
        if (error) return errorResp("Failed to subscribe", 500, origin);
      }

      return successResp({ message: "Subscribed" }, origin);
    }

    case "unsubscribe": {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", auth.user!.id);
      const endpoints = (subs || []).map((s: any) => s.endpoint);
      if (endpoints.length > 0) {
        await admin
          .from("push_subscriptions")
          .delete()
          .in("endpoint", endpoints);
      }
      return successResp({ message: "Unsubscribed" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
