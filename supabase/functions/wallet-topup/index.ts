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
    action: z.literal("top_up"),
    amount: z.number().positive("Amount must be positive"),
    reference: z.string().min(1, "Reference is required"),
    method: z.string().min(1, "Payment method is required"),
  }),
  z.object({ action: z.literal("get_transactions") }),
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
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "top_up": {
      const { amount, reference, method } = data;
      const { error } = await admin.rpc("credit_wallet", {
        p_user_id: auth.user!.id,
        p_amount: amount,
        p_description: `Wallet Top Up via ${method}`,
        p_reference: reference,
      });
      if (error) {
        console.error("wallet-topup error:", error);
        return errorResp("Failed to credit wallet", 500, origin);
      }
      await admin
        .from("wallet_transactions")
        .update({ payment_method: method, status: "Completed" })
        .eq("reference", reference);
      return successResp({ message: "Wallet credited" }, origin);
    }

    case "get_transactions": {
      const { data: txns, error } = await admin
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch transactions", 500, origin);
      return successResp(txns, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
