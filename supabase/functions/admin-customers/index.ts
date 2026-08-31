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
    action: z.literal("get_user"),
    user_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("update_profile"),
    user_id: z.string().uuid(),
    full_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_role"),
    user_id: z.string().uuid(),
    role: z.enum(["user", "agent", "admin"]),
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
      .from("profiles")
      .select("id, full_name, email, phone, role, created_at, agent_status")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return errorResp("Failed to fetch users", 500, origin);
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
      const { data: users, error } = await admin
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at, agent_status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return errorResp("Failed to fetch users", 500, origin);
      return successResp(users, origin);
    }

    case "get_user": {
      const { data: user, error } = await admin
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at, agent_status, wallet_balance, avatar_url")
        .eq("id", data.user_id)
        .single();
      if (error) return errorResp("User not found", 404, origin);
      return successResp(user, origin);
    }

    case "update_profile": {
      const updates: Record<string, unknown> = {};
      if (data.full_name !== undefined) updates.full_name = data.full_name;
      if (data.email !== undefined) updates.email = data.email;
      if (data.phone !== undefined) updates.phone = data.phone;

      if (Object.keys(updates).length === 0) {
        return errorResp("No fields to update", 400, origin);
      }

      const { error } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", data.user_id);
      if (error) return errorResp("Failed to update profile", 500, origin);
      return successResp({ message: "Profile updated" }, origin);
    }

    case "update_role": {
      // Prevent admin from changing their own role
      if (data.user_id === auth.user!.id) {
        return errorResp("Cannot change your own role", 400, origin);
      }
      // Prevent promoting to admin role (requires super-admin)
      if (data.role === "admin") {
        return errorResp("Cannot promote users to admin", 403, origin);
      }
      const { error } = await admin
        .from("profiles")
        .update({ role: data.role })
        .eq("id", data.user_id);
      if (error) return errorResp("Failed to update role", 500, origin);
      return successResp({ message: "Role updated" }, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
