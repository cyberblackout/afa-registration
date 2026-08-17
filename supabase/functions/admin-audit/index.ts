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

const querySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();
  let query = admin
    .from("audit_logs")
    .select("*, profiles!audit_logs_user_id_fkey(full_name, email)")
    .order("created_at", { ascending: false });

  // Parse filters from query params (GET) or body (POST)
  let filters: z.infer<typeof querySchema> = {};

  if (req.method === "GET") {
    const url = new URL(req.url);
    filters = {
      start_date: url.searchParams.get("start_date") || undefined,
      end_date: url.searchParams.get("end_date") || undefined,
      action: url.searchParams.get("action") || undefined,
      entity: url.searchParams.get("entity") || undefined,
    };
  } else if (req.method === "POST") {
    const body = await req.json();
    const validation = validateBody(body, querySchema);
    if (validation.error) return errorResp(validation.error, 400, origin);
    filters = validation.data!;
  } else {
    return errorResp("Method not allowed", 405, origin);
  }

  if (filters.start_date) query = query.gte("created_at", filters.start_date);
  if (filters.end_date) query = query.lte("created_at", filters.end_date);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entity) query = query.eq("entity", filters.entity);

  const { data, error } = await query;
  if (error) return errorResp("Failed to fetch audit logs", 500, origin);
  return successResp(data, origin);
});
