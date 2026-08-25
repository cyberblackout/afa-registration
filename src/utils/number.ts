/**
 * Safe numeric conversion utilities.
 *
 * Supabase PostgREST serializes PostgreSQL `numeric` columns as strings in JSON
 * (e.g. "100.00" not 100). TypeScript interfaces declare these as `number` but
 * the runtime value is a string. These utilities ensure safe conversion before
 * any arithmetic or `.toFixed()` call, preventing NaN and TypeError crashes.
 */

/**
 * Safely convert any value to a number.
 * Handles: number, string ("100.00"), null, undefined, empty string, NaN.
 * Returns 0 for any non-convertible value.
 */
export const safeNumber = (value: unknown): number => {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    return isNaN(n) ? 0 : n;
  }
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
};

/**
 * Format a numeric value as Ghana Cedis currency string.
 * Always returns a safe display — never "NaN" or "GH₵ NaN".
 * Example: "GH₵ 100.00"
 */
export const formatCurrency = (value: unknown): string => {
  return `GH₵ ${safeNumber(value).toFixed(2)}`;
};

/**
 * Sum an array of values safely, converting each to number first.
 * Prevents string concatenation bugs in reduce operations.
 */
export const safeSum = (values: unknown[]): number =>
  values.reduce<number>((sum, v) => sum + safeNumber(v), 0);
