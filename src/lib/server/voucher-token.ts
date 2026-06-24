import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

// Single source of truth for the signed voucher-share token. Fails *closed*:
// if VOUCHER_SECRET is missing we refuse to mint/accept tokens rather than
// falling back to a public string (which would make every voucher forgeable).
function voucherSecret(): string {
  const s = process.env.VOUCHER_SECRET;
  if (!s) throw new Error('VOUCHER_SECRET is not configured');
  return s;
}

// HMAC-SHA256(bookingId), first 20 hex chars. Output is intentionally identical
// to the historical inline implementation so links already emailed stay valid.
export function makeVoucherToken(bookingId: string): string {
  return createHmac('sha256', voucherSecret()).update(bookingId).digest('hex').slice(0, 20);
}

// Constant-time comparison; returns false (deny) on any misconfig/length mismatch.
export function verifyVoucherToken(bookingId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  let expected: string;
  try {
    expected = makeVoucherToken(bookingId);
  } catch {
    return false;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
