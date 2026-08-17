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
    status: z.string().optional(),
    user_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    id: z.string().uuid(),
    status: z.string().min(1),
    admin_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("bulk_update"),
    ids: z.array(z.string().uuid()).min(1),
    status: z.string().min(1),
  }),
  z.object({
    action: z.literal("add_timeline"),
    registration_id: z.string().uuid(),
    status: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("assign_admin"),
    id: z.string().uuid(),
    admin_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("add_document"),
    registration_id: z.string().uuid(),
    document_type: z.string().min(1),
    document_url: z.string().min(1),
    file_name: z.string().optional(),
  }),
  z.object({
    action: z.literal("update_document_status"),
    id: z.string().uuid(),
    status: z.string().min(1),
    admin_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("process_referral_reward"),
    registration_id: z.string().uuid(),
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
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const userId = url.searchParams.get("user_id");

    let query = admin
      .from("registrations")
      .select("*, registration_documents(*), registration_timeline(*), profiles!registrations_user_id_fkey(full_name, email, phone, role, username)")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) return errorResp("Failed to fetch registrations", 500, origin);
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
    case "update_status": {
      const { error } = await admin
        .from("registrations")
        .update({ status: data.status, admin_notes: data.admin_notes })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update status", 500, origin);

      await admin.from("registration_timeline").insert({
        registration_id: data.id,
        changed_by: auth.user!.id,
        status: data.status,
        note: data.admin_notes || `Status updated to ${data.status}`,
      });

      return successResp({ message: "Status updated" }, origin);
    }

    case "bulk_update": {
      const { error } = await admin
        .from("registrations")
        .update({ status: data.status })
        .in("id", data.ids);
      if (error) return errorResp("Bulk update failed", 500, origin);

      const timelineEntries = data.ids.map((id) => ({
        registration_id: id,
        changed_by: auth.user!.id,
        status: data.status,
        note: `Bulk status update to ${data.status}`,
      }));
      await admin.from("registration_timeline").insert(timelineEntries);

      return successResp({ message: `${data.ids.length} registrations updated` }, origin);
    }

    case "add_timeline": {
      const { error } = await admin.from("registration_timeline").insert({
        registration_id: data.registration_id,
        changed_by: auth.user!.id,
        status: data.status,
        note: data.note,
      });
      if (error) return errorResp("Failed to add timeline entry", 500, origin);
      return successResp({ message: "Timeline entry added" }, origin);
    }

    case "assign_admin": {
      const { error } = await admin
        .from("registrations")
        .update({ assigned_admin_id: data.admin_id })
        .eq("id", data.id);
      if (error) return errorResp("Failed to assign admin", 500, origin);
      return successResp({ message: "Admin assigned" }, origin);
    }

    case "add_document": {
      const { error } = await admin.from("registration_documents").insert({
        registration_id: data.registration_id,
        document_type: data.document_type,
        document_url: data.document_url,
        file_name: data.file_name || data.document_type,
        status: "pending",
      });
      if (error) return errorResp("Failed to add document", 500, origin);
      return successResp({ message: "Document added" }, origin);
    }

    case "update_document_status": {
      const { error } = await admin
        .from("registration_documents")
        .update({ status: data.status, admin_notes: data.admin_notes })
        .eq("id", data.id);
      if (error) return errorResp("Failed to update document status", 500, origin);
      return successResp({ message: "Document status updated" }, origin);
    }

    case "process_referral_reward": {
      const { data: reward, error } = await admin.rpc("process_referral_reward", {
        registration_id: data.registration_id,
      });
      if (error) {
        console.error("process_referral_reward error:", error);
        return errorResp("Failed to process referral reward", 500, origin);
      }
      return successResp(reward, origin);
    }

    default:
      return errorResp("Invalid action", 400, origin);
  }
});
