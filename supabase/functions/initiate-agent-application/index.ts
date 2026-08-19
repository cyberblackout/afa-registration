import { verifyAuth, getSupabaseAdmin, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";

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

  const auth = await verifyAuth(req, ["user"]);
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();

  // Check if already an agent
  const { data: profile } = await admin
    .from("profiles")
    .select("role, wallet_balance")
    .eq("id", auth.user!.id)
    .single();

  if (profile?.role === "agent" || profile?.role === "admin") {
    return errorResp("You are already an agent", 400, origin);
  }

  // Check for existing pending or initiated application
  const { data: existingApp } = await admin
    .from("agent_applications")
    .select("id, status, payment_status")
    .eq("user_id", auth.user!.id)
    .in("status", ["pending", "initiated"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingApp) {
    // If there's an initiated app with pending payment, let them retry
    if (existingApp.status === "initiated" && existingApp.payment_status === "pending") {
      // Delete the old initiated record and create a fresh one
      await admin.from("agent_applications").delete().eq("id", existingApp.id);
    } else {
      return errorResp("You already have a pending application", 400, origin);
    }
  }

  // Get agent fee from settings
  const { data: feeRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "agent_fee")
    .single();

  const agentFee = Number(feeRow?.value ?? 15);

  if (!agentFee || agentFee <= 0) {
    return errorResp("Agent registration fee is not configured", 500, origin);
  }

  // Generate unique reference for this agent application payment
  const reference = `AFA-AGENT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

  // Insert pending application record BEFORE calling Paystack
  const { data: appData, error: appError } = await admin
    .from("agent_applications")
    .insert({
      user_id: auth.user!.id,
      payment_status: "pending",
      payment_reference: reference,
      amount_paid: agentFee,
      status: "initiated",
    })
    .select("id")
    .single();

  if (appError) {
    console.error("initiate-agent-application insert error:", appError);
    return errorResp("Failed to create application record", 500, origin);
  }

  // Initialize Paystack transaction server-side
  const amountInSmallestUnit = Math.round(agentFee * 100);

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
        currency: "GHS",
        reference,
        metadata: {
          user_id: auth.user!.id,
          purpose: "agent_application",
          application_id: appData.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error("Paystack init error:", paystackData);
      // Clean up the application record if Paystack init fails
      await admin.from("agent_applications").delete().eq("id", appData.id);
      return errorResp(
        paystackData.message || "Failed to initialize payment",
        502,
        origin
      );
    }

    return successResp(
      {
        access_code: paystackData.data.access_code,
        reference,
        application_id: appData.id,
        amount: agentFee,
      },
      origin
    );
  } catch (err) {
    console.error("Paystack initialization error:", err);
    await admin.from("agent_applications").delete().eq("id", appData.id);
    return errorResp("Payment service temporarily unavailable", 500, origin);
  }
});
