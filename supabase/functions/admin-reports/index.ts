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

const reportSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  let startDate = "";
  let endDate = "";

  if (req.method === "POST") {
    const body = await req.json();
    const validation = validateBody(body, reportSchema);
    if (validation.error) return errorResp(validation.error, 400, origin);
    startDate = validation.data!.start_date || "";
    endDate = validation.data!.end_date || "";
  } else if (req.method === "GET") {
    const url = new URL(req.url);
    startDate = url.searchParams.get("start_date") || "";
    endDate = url.searchParams.get("end_date") || "";
  } else {
    return errorResp("Method not allowed", 405, origin);
  }

  const admin = getSupabaseAdmin();

  // Build queries with optional date filters
  let revenueQuery = admin
    .from("wallet_transactions")
    .select("amount, type, created_at")
    .eq("type", "credit");

  let registrationQuery = admin.from("registrations").select("status, created_at");

  let paymentQuery = admin
    .from("wallet_transactions")
    .select("amount, payment_method, status, created_at");

  let newUsersQuery = admin.from("profiles").select("id", { count: "exact", head: true });

  if (startDate) {
    revenueQuery = revenueQuery.gte("created_at", startDate);
    registrationQuery = registrationQuery.gte("created_at", startDate);
    paymentQuery = paymentQuery.gte("created_at", startDate);
    newUsersQuery = newUsersQuery.gte("created_at", startDate);
  }
  if (endDate) {
    revenueQuery = revenueQuery.lte("created_at", endDate);
    registrationQuery = registrationQuery.lte("created_at", endDate);
    paymentQuery = paymentQuery.lte("created_at", endDate);
    newUsersQuery = newUsersQuery.lte("created_at", endDate);
  }

  const [revenueRes, registrationRes, paymentRes, newUsersRes, totalUsersRes] =
    await Promise.all([
      revenueQuery,
      registrationQuery,
      paymentQuery,
      newUsersQuery,
      admin.from("profiles").select("id", { count: "exact", head: true }),
    ]);

  const revenue = (revenueRes.data || []).reduce(
    (sum: number, t: any) => sum + (Number(t.amount) || 0),
    0
  );

  const registrationStats = {
    total: (registrationRes.data || []).length,
    pending: (registrationRes.data || []).filter((r: any) => r.status === "pending").length,
    approved: (registrationRes.data || []).filter((r: any) => r.status === "approved").length,
    rejected: (registrationRes.data || []).filter((r: any) => r.status === "rejected").length,
    completed: (registrationRes.data || []).filter((r: any) => r.status === "completed").length,
  };

  const paymentStats = {
    total: (paymentRes.data || []).length,
    total_amount: (paymentRes.data || []).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0
    ),
    by_method: (paymentRes.data || []).reduce((acc: Record<string, number>, p: any) => {
      const method = p.payment_method || "Unknown";
      acc[method] = (acc[method] || 0) + (Number(p.amount) || 0);
      return acc;
    }, {}),
  };

  return successResp(
    {
      revenue,
      registration_stats: registrationStats,
      payment_stats: paymentStats,
      new_users: newUsersRes.count || 0,
      total_users: totalUsersRes.count || 0,
    },
    origin
  );
});
