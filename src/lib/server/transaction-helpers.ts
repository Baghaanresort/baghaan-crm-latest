import 'server-only';
import type { PaymentLinkPurpose } from '@/lib/constants/transactions';

export function buildReferenceId(bookingId: string, purpose: PaymentLinkPurpose, version: number): string {
  return `${bookingId}:${purpose}:v${version}`;
}

export function parseReferenceId(ref: string): { bookingId: string; purpose: string; version: number } | null {
  const m = /^(.+):([a-z_]+):v(\d+)$/.exec(ref);
  if (!m) return null;
  return { bookingId: m[1]!, purpose: m[2]!, version: Number(m[3]) };
}

// Advance in RUPEES. pct of 0 or >100 means "collect the full amount".
export function computeAdvance(totalRupees: number, pct: number): number {
  if (!Number.isFinite(totalRupees) || totalRupees < 0) throw new Error('computeAdvance: bad total');
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return Math.round(totalRupees);
  return Math.round(totalRupees * pct / 100);
}

export function nextLinkVersion(existingRefs: string[], bookingId: string, purpose: PaymentLinkPurpose): number {
  let max = 0;
  for (const ref of existingRefs) {
    const p = parseReferenceId(ref);
    if (p && p.bookingId === bookingId && p.purpose === purpose) max = Math.max(max, p.version);
  }
  return max + 1;
}
