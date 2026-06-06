// Voucher edit window: Sales/Admin may edit a booking's voucher only up to 12
// hours before check-in. Check-in has no stored time, so we anchor it to the
// resort's standard check-in hour in the resort's fixed timezone (IST, +5:30,
// no DST). Computing against a fixed offset — not server/browser local time —
// keeps the lock identical on the client (button state) and server (enforcement)
// no matter where each runs.

export const RESORT_CHECK_IN_HOUR = 14; // 2:00 PM local check-in (industry standard)
export const RESORT_UTC_OFFSET_MIN = 330; // IST = UTC+5:30
export const VOUCHER_EDIT_LEAD_HOURS = 12;

// UTC epoch ms of the moment editing locks for a given arrival date (YYYY-MM-DD).
export function voucherEditLockMs(arrivalISO: string): number {
  const [y, m, d] = arrivalISO.split('-').map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY; // malformed date → don't lock
  // check-in instant in UTC ms, then subtract the lead time
  const checkInUtcMs = Date.UTC(y, m - 1, d, RESORT_CHECK_IN_HOUR, 0, 0, 0) - RESORT_UTC_OFFSET_MIN * 60_000;
  return checkInUtcMs - VOUCHER_EDIT_LEAD_HOURS * 3_600_000;
}

export function isVoucherEditable(arrivalISO: string, now: number = Date.now()): boolean {
  return now < voucherEditLockMs(arrivalISO);
}
