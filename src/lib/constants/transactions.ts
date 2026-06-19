export const PAYMENT_LINK_PURPOSES = ['advance', 'balance', 'corporate_advance', 'final_bill'] as const;
export type PaymentLinkPurpose = (typeof PAYMENT_LINK_PURPOSES)[number];

export const PAYMENT_LINK_STATUSES = ['created', 'sent', 'partially_paid', 'paid', 'cancelled', 'expired'] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export const OUTBOUND_CHANNELS = ['whatsapp', 'email'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_PURPOSES = [
  'payment_request', 'voucher', 'balance_request', 'final_bill_request', 'payment_receipt', 'refund_notice',
] as const;
export type OutboundPurpose = (typeof OUTBOUND_PURPOSES)[number];

export const OUTBOUND_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

// meta key for the overridable default advance percentage
export const ADVANCE_DEFAULT_PCT_KEY = 'advance_default_pct';
export const ADVANCE_DEFAULT_PCT_FALLBACK = 50;

// Razorpay webhook events we subscribe to
export const RAZORPAY_WEBHOOK_EVENTS = [
  'payment_link.paid', 'payment_link.partially_paid', 'payment_link.cancelled',
  'payment_link.expired', 'refund.processed', 'refund.failed',
] as const;

// Maps a payment-link purpose to the payments-ledger row type it produces.
export function purposeToPaymentType(p: PaymentLinkPurpose): 'advance' | 'balance' {
  return p === 'advance' || p === 'corporate_advance' ? 'advance' : 'balance';
}
