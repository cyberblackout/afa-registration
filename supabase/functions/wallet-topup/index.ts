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
