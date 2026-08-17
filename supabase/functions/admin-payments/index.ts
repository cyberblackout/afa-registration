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
    action: z.literal("list"),
  }),
  z.object({
    action: z.literal("refund"),
    id: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().min(1),
    user_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("update_status"),
    id: z.string().uuid(),
    status: z.string().min(1),
  }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("wallet_transactions")
      .select("*, profiles!wallet_transactions_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    if (error) return errorResp("Failed to fetch payments", 500, origin);
    return successResp(data, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const admin = getSupabaseAdmin();
  const data = validation.data!;

  switch (data.action) {
    case "list": {
      const { data: payments, error } = await admin
        .from("wallet_transactions")
        .select("*, profiles!wallet_transactions_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch payments", 500, origin);
      return successResp(payments, origin);
    }

    case "refund": {
      // Credit the wallet
      const { error: creditError } = await admin.rpc("credit_wallet", {
        p_user_id: data.user_id,
        p_amount: data.amount,
        p_description: data.description,
      });
      if (creditError) return errorResp("Failed to process refund", 500, origin);

      // Mark original transaction as refunded
      await admin
        .from("wallet_transactions")
        .update({ status: "refunded" })
        .eq("id", data.id);

      return successResp({ message: "Refund processed" }, origin);
    }

    case "update_status": {
      const { error } = await admin.rpc("update_wallet_status", {
        p_transaction_id: data.id,
        p_status: data.status,
      });
      if (error) return errorResp("Failed to update status", 500, origin);
      return successResp({ message: "Status updated" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
