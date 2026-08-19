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

const createRegistrationSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
  ghana_card_id: z.string().min(1, "Ghana Card number is required"),
  address: z.string().min(1, "Location is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  occupation: z.string().min(1, "Occupation is required"),
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, createRegistrationSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const data = validation.data!;
  const admin = getSupabaseAdmin();

  // ─── WALLET GATE: fetch pricing + check balance before creating registration ───

  // Fetch AFA registration pricing
  const { data: pricingRow } = await admin
    .from("pricing")
    .select("normal_price, agent_price, amount")
    .eq("key", "afa_registration")
    .eq("active", true)
    .maybeSingle();

  // Determine fee based on caller's role: agents get agent_price, users get normal_price
  const userRole = auth.user!.role ?? "user";
  const feeAmount = userRole === "agent"
    ? Number(pricingRow?.agent_price ?? pricingRow?.amount ?? 0)
    : Number(pricingRow?.normal_price ?? pricingRow?.amount ?? 0);

  if (!feeAmount || feeAmount <= 0) {
    return errorResp("Registration fee is not configured. Please contact support.", 500, origin);
  }

  // Fetch user's current wallet balance
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("wallet_balance")
    .eq("id", auth.user!.id)
    .single();

  if (profileError || !profile) {
    return errorResp("Failed to verify wallet balance", 500, origin);
  }

  const currentBalance = Number(profile.wallet_balance ?? 0);

  if (currentBalance < feeAmount) {
    return errorResp(
      `Insufficient wallet balance. Registration fee: GHS ${feeAmount.toFixed(2)}, Your balance: GHS ${currentBalance.toFixed(2)}. Please top up your wallet.`,
      402,
      origin
    );
  }

  // ─── ATOMIC DEBIT: deduct fee from wallet ───
  const { data: debitResult, error: debitError } = await admin.rpc("debit_wallet", {
    p_user_id: auth.user!.id,
    p_amount: feeAmount,
    p_description: `AFA Registration Fee – ${data.full_name}`,
  });

  if (debitError) {
    console.error("create-registration debit error:", debitError);
    return errorResp("Failed to process payment. Please try again.", 500, origin);
  }

  const debit = debitResult as any;
  if (!debit?.success) {
    return errorResp(
      debit?.error || "Insufficient wallet balance. Please top up your wallet.",
      402,
      origin
    );
  }

  // ─── CREATE REGISTRATION (only after successful debit) ───

  const { data: regData, error: regError } = await admin
    .from("registrations")
    .insert({
      user_id: auth.user!.id,
      full_name: data.full_name,
      phone: data.phone,
      email: auth.user!.email,
      ghana_card_id: data.ghana_card_id,
      address: data.address,
      date_of_birth: data.date_of_birth,
      occupation: data.occupation,
      status: "pending",
    })
    .select("id")
    .single();

  if (regError) {
    // Registration failed after debit — this is a critical error
    // Refund the wallet immediately
    console.error("create-registration error:", regError);
    await admin.rpc("credit_wallet", {
      p_user_id: auth.user!.id,
      p_amount: feeAmount,
      p_description: "Refund – AFA Registration failed",
      p_reference: `REF-REG-FAIL-${Date.now()}`,
    });
    return errorResp("Failed to create registration. You have been refunded.", 500, origin);
  }

  // Add timeline entry
  await admin.from("registration_timeline").insert({
    registration_id: regData.id,
    changed_by: auth.user!.id,
    status: "pending",
    note: "Registration submitted – awaiting admin validation",
  });

  // Create a linked order so the registration appears in the user's Orders feed
  const { error: orderError } = await admin.from("orders").insert({
    user_id: auth.user!.id,
    amount: feeAmount,
    description: `AFA Registration – ${data.full_name}`,
    status: "pending",
    payment_status: "paid",
    source_type: "afa_registration",
    source_id: regData.id,
  });

  if (orderError) {
    console.error("create-registration order insert error:", orderError);
    // Order creation is non-critical; registration + debit succeeded
  }

  return successResp(
    {
      id: regData.id,
      message: "Registration submitted successfully",
      fee_charged: feeAmount,
      new_balance: debit.new_balance,
    },
    origin
  );
});
