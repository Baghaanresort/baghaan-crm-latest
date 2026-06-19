// Razorpay works in paise (integers). The app ledger works in rupees.
// Convert ONLY at the Razorpay boundary.

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`toPaise: invalid rupee amount ${rupees}`);
  }
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new Error(`fromPaise: invalid paise amount ${paise}`);
  }
  return paise / 100;
}

export function formatINR(rupees: number): string {
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}
