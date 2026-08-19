import { verifyAuth, getSupabaseAdmin, errorResp, successResp, getCorsHeaders } from "../_shared/auth.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  const auth = await verifyAuth(req, ["user"]);
  if (auth.error) return auth.error;

  // Support both GET (query params) and POST (body)
  let reference: string | null = null;
  if (req.method === "GET") {
    const url = new URL(req.url);
    reference = url.searchParams.get("reference");
  } else if (req.method === "POST") {
    try {
      const body = await req.json();
      reference = body.reference || null;
    } catch {
      return errorResp("Invalid request body", 400, origin);
    }
  } else {
    return errorResp("Method not allowed", 405, origin);
  }

  if (!reference) {
    return errorResp("Reference is required", 400, origin);
  }

  const admin = getSupabaseAdmin();

  // Look up the application by payment_reference
  const { data: app, error: appError } = await admin
    .from("agent_applications")
    .select("*")
    .eq("payment_reference", reference)
    .eq("user_id", auth.user!.id)
    .single();

  if (appError || !app) {
    return errorResp("Application not found", 404, origin);
  }

  // If already paid, return current status
  if (app.payment_status === "paid") {
    return successResp(
      {
        payment_status: app.payment_status,
        status: app.status,
        application_id: app.id,
        amount_paid: app.amount_paid,
      },
      origin
    );
  }

  // If already approved, return current status
  if (app.status === "approved") {
    return successResp(
      {
        payment_status: app.payment_status,
        status: app.status,
        application_id: app.id,
        agent_id: app.agent_id,
      },
      origin
    );
  }

  // Still pending — verify with Paystack if secret key is available
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
        // Payment confirmed — update application
        const { error: updateError } = await admin
          .from("agent_applications")
          .update({
            payment_status: "paid",
            status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", app.id);

        if (updateError) {
          console.error("verify-agent-application update error:", updateError);
        }

        return successResp(
          {
            payment_status: "paid",
            status: "pending",
            application_id: app.id,
            amount_paid: app.amount_paid,
            message: "Payment received! Your application is under admin review.",
          },
          origin
        );
      }

      if (verifyData.status && verifyData.data?.status === "failed") {
        await admin
          .from("agent_applications")
          .update({
            payment_status: "failed",
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", app.id);

        return successResp(
          {
            payment_status: "failed",
            status: "failed",
            application_id: app.id,
          },
          origin
        );
      }
    } catch (err) {
      console.error("Paystack verify error:", err);
      // Fall through to return pending status
    }
  }

  // Still pending
  return successResp(
    {
      payment_status: app.payment_status,
      status: app.status,
      application_id: app.id,
    },
    origin
  );
});
