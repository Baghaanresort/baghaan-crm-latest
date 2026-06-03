export const PAYMENT_MODES = [
  'UPI',
  'Bank Transfer / NEFT',
  'Cash',
  'Credit Card',
  'Debit Card',
  'Cheque',
  'BTC (Bill to Company)',
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

// Modes that Front Office can auto-verify (recorded at desk, no bank reconciliation needed)
export const FO_AUTO_VERIFY_MODES: ReadonlySet<string> = new Set(['Cash', 'Credit Card', 'Debit Card']);
