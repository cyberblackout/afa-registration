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

  // Create registration
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
    console.error("create-registration error:", regError);
    return errorResp("Failed to create registration", 500, origin);
  }

  // Add timeline entry
  await admin.from("registration_timeline").insert({
    registration_id: regData.id,
    changed_by: auth.user!.id,
    status: "pending",
    note: "Registration submitted – awaiting admin validation",
  });

  // Create a linked order so the registration appears in the user's Orders feed
  const { data: pricingRow } = await admin
    .from("pricing")
    .select("amount")
    .eq("key", "afa_registration")
    .eq("active", true)
    .maybeSingle();

  const orderAmount = pricingRow?.amount ?? 150;

  const { error: orderError } = await admin.from("orders").insert({
    user_id: auth.user!.id,
    amount: orderAmount,
    description: `AFA Registration – ${data.full_name}`,
    status: "pending",
    payment_status: "pending",
    source_type: "afa_registration",
    source_id: regData.id,
  });

  if (orderError) {
    console.error("create-registration order insert error:", orderError);
    // Order creation is non-critical; registration was saved successfully
  }

  return successResp({ id: regData.id, message: "Registration submitted" }, origin);
});
