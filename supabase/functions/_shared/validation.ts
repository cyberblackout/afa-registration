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

/**
 * Server-side counterpart of src/utils/number.ts `safeNumber`.
 * PostgREST returns Postgres `numeric` columns as strings, so anything that
 * has to compare or derive a money value needs a guarded conversion first.
 * Returns null (never NaN) for anything that is not a finite number.
 */
export function toNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Difference between two numeric(12,2) values computed in integer cents so no
 * binary floating point error can leak into a money figure.
 * Returns null when either side is not a usable number.
 */
export function differenceInCents(a: unknown, b: unknown): number | null {
  const ca = toNumeric(a);
  const cb = toNumeric(b);
  if (ca === null || cb === null) return null;
  return Math.round(ca * 100) - Math.round(cb * 100);
}

