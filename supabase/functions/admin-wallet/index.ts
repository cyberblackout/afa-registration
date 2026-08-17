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
    action: z.literal("list_users"),
  }),
  z.object({
    action: z.literal("list_transactions"),
    user_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("credit"),
    user_id: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().min(1),
  }),
  z.object({
    action: z.literal("debit"),
    user_id: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().min(1),
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

    if (error) return errorResp("Failed to fetch transactions", 500, origin);
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
    case "list_users": {
      const { data: users, error } = await admin
        .from("profiles")
        .select("id, full_name, email, wallet_balance")
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch users", 500, origin);
      return successResp(users, origin);
    }

    case "list_transactions": {
      const { data: txns, error } = await admin
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", data.user_id)
        .order("created_at", { ascending: false });
      if (error) return errorResp("Failed to fetch transactions", 500, origin);
      return successResp(txns, origin);
    }

    case "credit": {
      const { error } = await admin.rpc("credit_wallet", {
        p_user_id: data.user_id,
        p_amount: data.amount,
        p_description: data.description,
      });
      if (error) return errorResp("Failed to credit wallet", 500, origin);
      return successResp({ message: "Wallet credited" }, origin);
    }

    case "debit": {
      const { error } = await admin.rpc("debit_wallet", {
        p_user_id: data.user_id,
        p_amount: data.amount,
        p_description: data.description,
      });
      if (error) return errorResp("Failed to debit wallet", 500, origin);
      return successResp({ message: "Wallet debited" }, origin);
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
