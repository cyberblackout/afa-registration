import { verifyAuth, getSupabaseAdmin, jsonResp, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

if (PAYSTACK_SECRET && PAYSTACK_SECRET.startsWith("sk_test_")) {
  console.warn("WARNING: PAYSTACK_SECRET_KEY is a TEST key — verify transactions will fail against live keys");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req, ["user", "agent", "admin"]);
  if (auth.error) return auth.error;

  // Support both GET (query params) and POST (body)
  let reference: string | null = null;
  if (req.method === "GET") {
    const url = new URL(req.url);
    reference = url.searchParams.get("reference");
  } else {
    try {
      const body = await req.json();
      reference = body.reference || null;
    } catch {
      return errorResp("Invalid request body", 400, origin);
    }
  }

  if (!reference) {
    return errorResp("Reference is required", 400, origin);
  }

  const admin = getSupabaseAdmin();

  // Look up the transaction in our DB
  const { data: tx, error: txError } = await admin
    .from("wallet_transactions")
    .select("*")
    .eq("reference", reference)
    .eq("user_id", auth.user!.id) // Security: only allow users to check their own transactions
    .single();

  if (txError || !tx) {
    return errorResp("Transaction not found", 404, origin);
  }

  // If already completed or failed, return current status
  if (tx.status === "completed") {
    return successResp(
      {
        status: "completed",
        reference: tx.reference,
        amount: tx.amount,
        payment_method: tx.payment_method,
        created_at: tx.created_at,
      },
      origin
    );
  }

  if (tx.status === "failed") {
    return successResp(
      {
        status: "failed",
        reference: tx.reference,
        amount: tx.amount,
      },
      origin
    );
  }

  // Transaction is still pending — verify with Paystack if secret key is available
  if (PAYSTACK_SECRET) {
    try {
      const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      });

      const verifyData = await verifyRes.json();

      if (verifyData.status && verifyData.data?.status === "success") {
        // Server confirms success — credit wallet
        const { error: creditError } = await admin.rpc("credit_wallet", {
          p_user_id: auth.user!.id,
          p_amount: tx.amount,
          p_description: "Wallet Top Up via Paystack",
          p_reference: reference,
        });

        if (!creditError) {
          const channel = verifyData.data?.channel;
          const method = channel === "mobile_money"
            ? "Mobile Money"
            : channel === "card"
              ? "Card"
              : channel === "bank"
                ? "Bank"
                : "Paystack";

          await admin
            .from("wallet_transactions")
            .update({
              status: "completed",
              payment_method: method,
              updated_at: new Date().toISOString(),
            })
            .eq("reference", reference);

          return successResp(
            {
              status: "completed",
              reference,
              amount: tx.amount,
              payment_method: method,
            },
            origin
          );
        }
      }

      if (verifyData.status && verifyData.data?.status === "failed") {
        await admin
          .from("wallet_transactions")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("reference", reference);

        return successResp({ status: "failed", reference }, origin);
      }
    } catch (err) {
      console.error("Paystack verify error:", err);
      // Fall through to return pending status
    }
  }

  // Still pending
  return successResp(
    {
      status: "pending",
      reference: tx.reference,
      amount: tx.amount,
    },
    origin
  );
});
