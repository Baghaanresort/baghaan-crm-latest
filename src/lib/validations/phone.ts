import { z } from 'zod';

// Single source of truth for phone-number rules across the CRM. Numbers may be
// domestic or international, so we accept whatever the user naturally types —
// spaces, dashes, parentheses, and an optional leading + country code — and only
// require that it contains a sensible count of digits. Per the E.164 standard an
// international number is at most 15 digits; 7 is a reasonable lower bound for the
// shortest national numbers. We normalise to "+digits" (or bare digits) before
// storing so WhatsApp links and guest de-duplication stay stable.

export const PHONE_ERROR = 'Enter a valid phone number';

const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/** Keep a leading + if present, strip every other non-digit character. */
export function normalizePhone(raw: string): string {
  const s = (raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  return s.startsWith('+') ? `+${digits}` : digits;
}

/** True when `raw` has 7–15 digits (ignoring +, spaces, dashes, etc.). */
export function isValidPhone(raw: string): boolean {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS;
}

/** Required phone field: normalises then enforces the digit-count rule. */
export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().refine(isValidPhone, PHONE_ERROR));
