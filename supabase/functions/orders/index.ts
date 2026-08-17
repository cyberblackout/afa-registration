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
    user_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("create"),
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

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  if (req.method === "GET") {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const admin = getSupabaseAdmin();

    let query = admin
      .from("orders")
      .select("*, profiles!orders_user_id_fkey(full_name, email, phone)")
      .order("created_at", { ascending: false });

    // Admins see all, users see only their own
    if (auth.user!.role !== "admin") {
      query = query.eq("user_id", auth.user!.id);
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) return errorResp("Failed to fetch orders", 500, origin);
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
      let query = admin
        .from("orders")
        .select("*, profiles!orders_user_id_fkey(full_name, email, phone)")
        .order("created_at", { ascending: false });

      if (auth.user!.role !== "admin") {
        query = query.eq("user_id", auth.user!.id);
      } else if (data.user_id) {
        query = query.eq("user_id", data.user_id);
      }

      const { data: orders, error } = await query;
      if (error) return errorResp("Failed to fetch orders", 500, origin);
      return successResp(orders, origin);
    }

    case "create": {
      const { data: order, error } = await admin
        .from("orders")
        .insert({
          user_id: auth.user!.id,
          amount: data.amount,
          description: data.description,
          status: "pending",
        })
        .select()
        .single();
      if (error) return errorResp("Failed to create order", 500, origin);
      return successResp(order, origin);
    }

    case "update_status": {
      // Only admins can update order status
      if (auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { error } = await admin
        .from("orders")
        .update({ status: data.status })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update status", 500, origin);
      return successResp({ message: "Status updated" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
