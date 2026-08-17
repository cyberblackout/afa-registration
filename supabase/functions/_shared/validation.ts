import { z } from "https://esm.sh/zod@4.4.3";

export { z };

export function validateBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { data: T; error?: never } | { data?: never; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("; ");
    return { error: msg };
  }
  return { data: result.data };
}
