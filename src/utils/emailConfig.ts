import { z } from 'zod';

// Client mirror of supabase/functions/_shared/validation.ts
// (emailConfigSchema). MUST STAY BYTE-IDENTICAL with it: same fields,
// same limits, same messages. Both packages resolve zod ^4.4.3.
//
// The server is authoritative for the from-domain rule, because only
// it can ask Resend which domain is verified. `fromDomainMatchesHint`
// below is a best-effort early warning so the admin does not have to
// round-trip to learn the address will be rejected.

export const EMAIL_MAX_FROM_NAME = 80;

export const emailConfigSchema = z.object({
  // Write-only. Non-empty replaces the stored key; empty/omitted
  // leaves it unchanged. Never echoed back by any endpoint.
  resend_api_key: z.string().trim().optional(),
  email_from: z
    .string()
    .trim()
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'From email must be a valid email address'
    ),
  email_from_name: z
    .string()
    .trim()
    .min(1, 'From name is required')
    .max(EMAIL_MAX_FROM_NAME, `From name must be ${EMAIL_MAX_FROM_NAME} characters or fewer`),
  email_reply_to: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Reply-to must be a valid email address'
    )
    .optional(),
  email_enabled: z.boolean(),
});

export type EmailConfigInput = z.infer<typeof emailConfigSchema>;

export function emailDomainOf(address: string): string {
  return address.trim().split('@')[1]?.toLowerCase() ?? '';
}

// True when the from address is on a domain the server already knows
// Resend has verified. Returns null when there is nothing to compare
// against (no key / unknown domain status) — the caller must not treat
// null as an error.
export function fromDomainMatchesHint(
  fromEmail: string,
  verifiedDomain: string | null | undefined
): boolean | null {
  if (!verifiedDomain) return null;
  return emailDomainOf(fromEmail) === verifiedDomain.toLowerCase();
}
