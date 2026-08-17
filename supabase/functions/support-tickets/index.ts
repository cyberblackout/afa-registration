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
    action: z.literal("create"),
    subject: z.string().min(1),
    message: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    id: z.string().uuid(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
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
    const admin = getSupabaseAdmin();
    let query = admin
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    // Non-admins only see their own tickets
    if (auth.user!.role !== "admin") {
      query = query.eq("user_id", auth.user!.id);
    }

    const { data, error } = await query;
    if (error) return errorResp("Failed to fetch tickets", 500, origin);
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
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (auth.user!.role !== "admin") {
        query = query.eq("user_id", auth.user!.id);
      }

      const { data: tickets, error } = await query;
      if (error) return errorResp("Failed to fetch tickets", 500, origin);
      return successResp(tickets, origin);
    }

    case "create": {
      const { error } = await admin.from("support_tickets").insert({
        user_id: auth.user!.id,
        subject: data.subject,
        message: data.message,
        priority: data.priority || "medium",
        status: "open",
      });
      if (error) return errorResp("Failed to create ticket", 500, origin);
      return successResp({ message: "Ticket created" }, origin);
    }

    case "update_status": {
      if (auth.user!.role !== "admin") {
        return errorResp("Insufficient permissions", 403, origin);
      }
      const { error } = await admin
        .from("support_tickets")
        .update({ status: data.status })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update ticket", 500, origin);
      return successResp({ message: "Ticket updated" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
