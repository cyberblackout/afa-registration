import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, getSupabaseAdmin, jsonResp, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }
  if (req.method !== "POST") return errorResp("Method not allowed", 405, origin);

  if (!PAYSTACK_SECRET) {
    return errorResp("Payment system not configured", 500, origin);
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResp("Invalid request body", 400, origin);
  }

  const amount = Number(body.amount);
  if (!amount || amount <= 0 || isNaN(amount)) {
    return errorResp("Invalid amount", 400, origin);
  }

  const admin = getSupabaseAdmin();

  // Fetch min/max top-up limits from pricing table
  const { data: minRow } = await admin
    .from("pricing")
    .select("amount")
    .eq("key", "wallet_min_topup")
    .single();
  const { data: maxRow } = await admin
    .from("pricing")
    .select("amount")
    .eq("key", "wallet_max_topup")
    .single();

  const minTopup = Number(minRow?.amount) || 10;
  const maxTopup = Number(maxRow?.amount) || 10000;

  if (amount < minTopup) {
    return errorResp(`Minimum top-up amount is GH₵${minTopup.toFixed(2)}`, 400, origin);
  }
  if (amount > maxTopup) {
    return errorResp(`Maximum top-up amount is GH₵${maxTopup.toFixed(2)}`, 400, origin);
  }

  // Fetch Paystack config from app_settings
  const { data: pubKeyRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "paystack_public_key")
    .single();
  const { data: currRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "currency")
    .single();

  const currency = currRow?.value || "GHS";

  // Generate unique reference
  const reference = `AFA-TOPUP-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

  // Initialize Paystack transaction server-side
  // Paystack amounts are in pesewas (kobo for NGN) — multiply by 100
  const amountInSmallestUnit = Math.round(amount * 100);

  try {
    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: auth.user!.email,
        amount: amountInSmallestUnit,
        currency,
        reference,
        metadata: {
          user_id: auth.user!.id,
          purpose: "wallet_topup",
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error("Paystack init error:", paystackData);
      return errorResp(
        paystackData.message || "Failed to initialize payment",
        502,
        origin
      );
    }

    // Insert pending transaction record
    const { error: insertError } = await admin.from("wallet_transactions").insert({
      user_id: auth.user!.id,
      type: "credit",
      amount,
      description: "Wallet Top Up via Paystack",
      reference,
      status: "pending",
      payment_method: "Paystack",
    });

    if (insertError) {
      console.error("Insert transaction error:", insertError);
      return errorResp("Failed to create transaction record", 500, origin);
    }

    return successResp(
      {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference,
      },
      origin
    );
  } catch (err) {
    console.error("Paystack initialization error:", err);
    return errorResp("Payment service temporarily unavailable", 500, origin);
  }
});
