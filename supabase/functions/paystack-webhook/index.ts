import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseAdmin, getCorsHeaders } from "../_shared/auth.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

// Verify Paystack webhook signature (HMAC SHA512)
async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const bodyData = encoder.encode(body);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, bodyData);
  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignature === signature;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Webhooks can be GET (Paystack verification) or POST (actual webhook)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  // Only POST is valid for webhooks
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!PAYSTACK_SECRET) {
    console.error("PAYSTACK_SECRET_KEY not configured");
    return new Response("Payment system not configured", { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  // Verify webhook signature
  const isValid = await verifyWebhookSignature(rawBody, signature, PAYSTACK_SECRET);
  if (!isValid) {
    console.error("Invalid webhook signature - rejecting request");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("Invalid webhook payload");
    return new Response("Invalid payload", { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const eventType = event?.event;
  const transactionData = event?.data;

  if (!eventType || !transactionData) {
    console.error("Missing event type or transaction data");
    return new Response("OK", { status: 200 }); // Return 200 to prevent retries for malformed events
  }

  const reference = transactionData.reference;

  if (!reference) {
    console.error("No reference in transaction data");
    return new Response("OK", { status: 200 });
  }

  // Look up the pending transaction (idempotency check)
  const { data: existingTx, error: lookupError } = await admin
    .from("wallet_transactions")
    .select("*")
    .eq("reference", reference)
    .single();

  if (lookupError || !existingTx) {
    console.error(`Transaction not found for reference: ${reference}`);
    return new Response("OK", { status: 200 });
  }

  // Idempotency: if already processed, skip
  if (existingTx.status === "completed" || existingTx.status === "failed") {
    console.log(`Transaction ${reference} already processed with status: ${existingTx.status}`);
    return new Response("OK", { status: 200 });
  }

  if (eventType === "charge.success") {
    // Server-side verification: call Paystack Verify API to confirm
    try {
      const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      });

      const verifyData = await verifyRes.json();

      if (!verifyData.status || verifyData.data?.status !== "success") {
        console.error(`Paystack verification failed for ${reference}:`, verifyData);
        await admin
          .from("wallet_transactions")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("reference", reference);
        return new Response("OK", { status: 200 });
      }

      // Double-check amount matches (never trust webhook alone for amount)
      const verifiedAmount = verifyData.data?.amount / 100; // Convert from pesewas
      if (Math.abs(verifiedAmount - existingTx.amount) > 0.01) {
        console.error(`Amount mismatch for ${reference}: expected ${existingTx.amount}, got ${verifiedAmount}`);
        await admin
          .from("wallet_transactions")
          .update({ status: "failed", description: "Amount mismatch", updated_at: new Date().toISOString() })
          .eq("reference", reference);
        return new Response("OK", { status: 200 });
      }

      // Credit wallet atomically
      const { data: creditResult, error: creditError } = await admin.rpc("credit_wallet", {
        p_user_id: existingTx.user_id,
        p_amount: existingTx.amount,
        p_description: "Wallet Top Up via Paystack",
        p_reference: reference,
      });

      if (creditError) {
        console.error(`credit_wallet failed for ${reference}:`, creditError);
        // Don't update status — webhook will retry
        return new Response("OK", { status: 200 });
      }

      // Mark transaction as completed
      const channel = verifyData.data?.channel;
      const method = channel === "mobile_money"
        ? "Mobile Money"
        : channel === "card"
          ? "Card"
          : channel === "bank"
            ? "Bank"
            : "Paystack";

      await admin
        .from("wallet_transactions")
        .update({
          status: "completed",
          payment_method: method,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      console.log(`Successfully credited wallet for reference ${reference}, user ${existingTx.user_id}, amount ${existingTx.amount}`);
    } catch (err) {
      console.error(`Error processing charge.success for ${reference}:`, err);
      // Don't return error — webhook will retry
    }

    return new Response("OK", { status: 200 });
  }

  // For failed/abandoned events
  if (eventType === "charge.failed" || eventType === "charge.abandoned") {
    await admin
      .from("wallet_transactions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("reference", reference);
    console.log(`Marked transaction ${reference} as failed (event: ${eventType})`);
  }

  return new Response("OK", { status: 200 });
});
