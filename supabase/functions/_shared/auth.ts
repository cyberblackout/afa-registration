import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
  };
}

export async function verifyAuth(
  req: Request,
  allowedRoles?: string[]
): Promise<{ user: AuthUser; error?: never } | { user?: never; error: Response }> {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      ),
    };
  }

  // Get the user's business role from profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "User profile not found" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      ),
    };
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      ),
    };
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      role: profile.role,
    },
  };
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

export function getSupabaseWithAuth(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
}

export function jsonResp(
  data: unknown,
  status = 200,
  origin?: string | null
): Response {
  const cors = getCorsHeaders(origin);
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function errorResp(
  message: string,
  status = 400,
  origin?: string | null
): Response {
  return jsonResp({ success: false, error: message }, status, origin);
}

export function successResp(
  data: unknown,
  origin?: string | null
): Response {
  return jsonResp({ success: true, data }, 200, origin);
}
