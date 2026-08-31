import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseAdmin, getCorsHeaders } from "../_shared/auth.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

// Verify Paystack webhook signature (HMAC SHA512) with constant-time comparison
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

  // Constant-time comparison to prevent timing attacks
  if (computedSignature.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// Determine payment purpose from reference prefix
function getPaymentPurpose(reference: string): "wallet_topup" | "agent_application" | "unknown" {
  if (reference.startsWith("AFA-TOPUP-")) return "wallet_topup";
  if (reference.startsWith("AFA-AGENT-")) return "agent_application";
  return "unknown";
}

// Handle wallet top-up payment
async function handleWalletTopup(
  admin: any,
  reference: string,
  transactionData: any,
  eventType: string
) {
  // Look up the pending wallet transaction
  const { data: existingTx, error: lookupError } = await admin
    .from("wallet_transactions")
    .select("*")
    .eq("reference", reference)
    .single();

  if (lookupError || !existingTx) {
    console.error(`Wallet transaction not found for reference: ${reference}`);
    return;
  }

  // Idempotency: if already processed, skip
  if (existingTx.status === "completed" || existingTx.status === "failed") {
    console.log(`Wallet transaction ${reference} already processed: ${existingTx.status}`);
    return;
  }

  if (eventType === "charge.success") {
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
        return;
      }

      // Double-check amount matches
      const verifiedAmount = verifyData.data?.amount / 100;
      if (Math.abs(verifiedAmount - existingTx.amount) > 0.01) {
        console.error(`Amount mismatch for ${reference}: expected ${existingTx.amount}, got ${verifiedAmount}`);
        await admin
          .from("wallet_transactions")
          .update({ status: "failed", description: "Amount mismatch", updated_at: new Date().toISOString() })
          .eq("reference", reference);
        return;
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
        return;
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
      console.error(`Error processing wallet topup for ${reference}:`, err);
    }
  } else if (eventType === "charge.failed" || eventType === "charge.abandoned") {
    await admin
      .from("wallet_transactions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("reference", reference);
    console.log(`Marked wallet transaction ${reference} as failed (event: ${eventType})`);
  }
}

// Handle agent application payment
async function handleAgentApplication(
  admin: any,
  reference: string,
  transactionData: any,
  eventType: string
) {
  // Look up the pending agent application
  const { data: existingApp, error: lookupError } = await admin
    .from("agent_applications")
    .select("*")
    .eq("payment_reference", reference)
    .single();

  if (lookupError || !existingApp) {
    console.error(`Agent application not found for reference: ${reference}`);
    return;
  }

  // Idempotency: if already paid, skip
  if (existingApp.payment_status === "paid" || existingApp.payment_status === "failed") {
    console.log(`Agent application ${reference} already processed: ${existingApp.payment_status}`);
    return;
  }

  if (eventType === "charge.success") {
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
        console.error(`Paystack verification failed for agent application ${reference}:`, verifyData);
        await admin
          .from("agent_applications")
          .update({ payment_status: "failed", status: "failed", updated_at: new Date().toISOString() })
          .eq("id", existingApp.id);
        return;
      }

      // Double-check amount matches
      const verifiedAmount = verifyData.data?.amount / 100;
      if (Math.abs(verifiedAmount - existingApp.amount_paid) > 0.01) {
        console.error(`Amount mismatch for agent application ${reference}: expected ${existingApp.amount_paid}, got ${verifiedAmount}`);
        await admin
          .from("agent_applications")
          .update({ payment_status: "failed", status: "failed", updated_at: new Date().toISOString() })
          .eq("id", existingApp.id);
        return;
      }

      // Payment confirmed — update application status to pending for admin review
      await admin
        .from("agent_applications")
        .update({
          payment_status: "paid",
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingApp.id);

      // Notify user that application is submitted and awaiting admin review
      await admin.from("notifications").insert({
        user_id: existingApp.user_id,
        title: "Agent Application Submitted",
        message: "Your agent application has been submitted successfully. Waiting for admin approval.",
        type: "info",
      });

      console.log(`Successfully processed agent application payment for reference ${reference}, user ${existingApp.user_id}`);
    } catch (err) {
      console.error(`Error processing agent application payment for ${reference}:`, err);
    }
  } else if (eventType === "charge.failed" || eventType === "charge.abandoned") {
    await admin
      .from("agent_applications")
      .update({ payment_status: "failed", status: "failed", updated_at: new Date().toISOString() })
      .eq("id", existingApp.id);
    console.log(`Marked agent application ${reference} as failed (event: ${eventType})`);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

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
    return new Response("OK", { status: 200 });
  }

  const reference = transactionData.reference;

  if (!reference) {
    console.error("No reference in transaction data");
    return new Response("OK", { status: 200 });
  }

  // Route to appropriate handler based on reference prefix
  const purpose = getPaymentPurpose(reference);

  if (purpose === "wallet_topup") {
    await handleWalletTopup(admin, reference, transactionData, eventType);
  } else if (purpose === "agent_application") {
    await handleAgentApplication(admin, reference, transactionData, eventType);
  } else {
    console.log(`Unknown payment purpose for reference: ${reference}`);
  }

  return new Response("OK", { status: 200 });
});
