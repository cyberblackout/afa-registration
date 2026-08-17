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

const updateProfileSchema = z.object({
  user_id: z.string().uuid().optional(),
  full_name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  address: z.string().optional(),
  avatar_url: z.string().url().optional(),
  notification_preferences: z
    .object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      push: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .optional(),
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, origin);
  }

  const auth = await verifyAuth(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const validation = validateBody(body, updateProfileSchema);
  if (validation.error) return errorResp(validation.error, 400, origin);

  const { user_id, ...updates } = validation.data!;
  const targetUserId = user_id || auth.user!.id;

  // Non-admins can only update their own profile
  if (targetUserId !== auth.user!.id && auth.user!.role !== "admin") {
    return errorResp("Insufficient permissions", 403, origin);
  }

  // Filter out undefined values
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) filtered[key] = value;
  }

  if (Object.keys(filtered).length === 0) {
    return errorResp("No fields to update", 400, origin);
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update(filtered)
    .eq("id", targetUserId);

  if (error) {
    console.error("update-profile error:", error);
    return errorResp("Failed to update profile", 500, origin);
  }

  return successResp({ message: "Profile updated" }, origin);
});
