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
  z.object({ action: z.literal("get_stats") }),
  z.object({ action: z.literal("get_daily_chart") }),
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["admin"]);
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();

  // GET defaults to get_stats
  if (req.method === "GET") {
    return getStats(admin, origin);
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const body = await req.json();
  const validation = validateBody(body, actionSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const data = validation.data!;

  switch (data.action) {
    case "get_stats":
      return getStats(admin, origin);
    case "get_daily_chart":
      return getDailyChart(admin, origin);
    default:
      return errorResp("Invalid action", 400, origin);
  }
});

async function getStats(admin: any, origin: string | null) {
  const [
    totalUsersRes,
    totalRegistrationsRes,
    todayRegistrationsRes,
    pendingRegistrationsRes,
    revenueRes,
    walletBalanceRes,
    recentRegistrationsRes,
    approvedRes,
    rejectedRes,
    completedRes,
    processingRes,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("registrations").select("id", { count: "exact", head: true }),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("wallet_transactions")
      .select("amount")
      .eq("type", "credit")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    admin.from("profiles").select("wallet_balance"),
    admin
      .from("registrations")
      .select("*, profiles!registrations_user_id_fkey(full_name, phone)")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected"),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),
  ]);

  const revenue = (revenueRes.data || []).reduce(
    (sum: number, t: any) => sum + (Number(t.amount) || 0),
    0
  );
  const totalWalletBalance = (walletBalanceRes.data || []).reduce(
    (sum: number, p: any) => sum + (Number(p.wallet_balance) || 0),
    0
  );

  return successResp(
    {
      total_users: totalUsersRes.count || 0,
      total_registrations: totalRegistrationsRes.count || 0,
      today_registrations: todayRegistrationsRes.count || 0,
      pending_registrations: pendingRegistrationsRes.count || 0,
      revenue,
      total_wallet_balance: totalWalletBalance,
      recent_registrations: recentRegistrationsRes.data || [],
      approved_registrations: approvedRes.count || 0,
      rejected_registrations: rejectedRes.count || 0,
      completed_registrations: completedRes.count || 0,
      processing_registrations: processingRes.count || 0,
    },
    origin
  );
}

async function getDailyChart(admin: any, origin: string | null) {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });

    const [revRes, regsRes] = await Promise.all([
      admin
        .from("wallet_transactions")
        .select("amount")
        .eq("type", "credit")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString()),
      admin
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString()),
    ]);

    days.push({
      day: dayLabel,
      revenue: (revRes.data || []).reduce((s: number, t: any) => s + (t.amount || 0), 0),
      registrations: regsRes.count ?? 0,
    });
  }
  return successResp(days, origin);
}
