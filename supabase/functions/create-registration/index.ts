import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  verifyAuth,
  getSupabaseAdmin,
  errorResp,
  successResp,
  jsonResp,
  getCorsHeaders,
} from "../_shared/auth.ts";
import { z, validateBody } from "../_shared/validation.ts";

// NOTE: no price, role or user id is accepted from the client. The amount is
// resolved server-side inside create_afa_registration from profiles.role.
// `expected_amount` is optional and used ONLY to detect that the price the
// user was shown has changed; it never decides what is charged.
const createRegistrationSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
  ghana_card_id: z.string().min(1, "Ghana Card number is required"),
  address: z.string().min(1, "Location is required"),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
  occupation: z.string().min(1, "Occupation is required"),
  expected_amount: z.number().optional(),
});

const KNOWN_RPC_ERRORS = new Set([
  "Authentication required",
  "Caller profile not found",
  "Registration fee is not configured",
]);

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

  // ─── ATOMIC: role -> price -> lock wallet -> verify -> debit -> insert ───
  const { data: result, error: rpcError } = await admin.rpc(
    "create_afa_registration",
    {
      p_caller_id: auth.user!.id,
      p_full_name: data.full_name,
      p_phone: data.phone,
      p_email: auth.user!.email,
      p_ghana_card_id: data.ghana_card_id,
      p_address: data.address,
      p_date_of_birth: data.date_of_birth,
      p_occupation: data.occupation,
      p_expected_amount: data.expected_amount ?? null,
    }
  );

  if (rpcError) {
    const message = rpcError.message || "";
    if (KNOWN_RPC_ERRORS.has(message)) {
      return errorResp(message, 400, origin);
    }
    if (message.includes("invalid input syntax for type date")) {
      return errorResp("Date of birth is not a valid date", 400, origin);
    }
    // Any other failure rolled the whole transaction back: nothing was charged.
    console.error("create-registration rpc error:", message);
    return errorResp(
      "Failed to create registration. You have not been charged. Please try again.",
      500,
      origin
    );
  }

  const res = result as any;

  if (!res?.success) {
    if (res?.code === "PRICE_CHANGED") {
      return jsonResp(
        {
          success: false,
          code: "PRICE_CHANGED",
          error: res.error,
          data: {
            current_price: res.current_price,
            tier: res.tier,
          },
        },
        409,
        origin
      );
    }
    if (res?.code === "INSUFFICIENT_BALANCE") {
      return jsonResp(
        {
          success: false,
          code: "INSUFFICIENT_BALANCE",
          error: res.error,
          data: { required: res.required, balance: res.balance },
        },
        402,
        origin
      );
    }
    return errorResp(res?.error || "Registration failed", 400, origin);
  }

  return successResp(
    {
      id: res.id,
      message: res.message,
      fee_charged: res.fee_charged,
      pricing_tier: res.pricing_tier,
      new_balance: res.new_balance,
    },
    origin
  );
});
