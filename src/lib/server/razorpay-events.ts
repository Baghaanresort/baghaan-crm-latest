import 'server-only';

export type ParsedEventKind =
  | 'payment_link_paid' | 'payment_link_partially_paid' | 'payment_link_closed'
  | 'refund_processed' | 'refund_failed' | 'ignored';

export interface ParsedEvent {
  kind: ParsedEventKind;
  // `| undefined` is required under this repo's `exactOptionalPropertyTypes`
  // so the extracted-or-undefined fields below are assignable.
  linkId?: string | undefined;
  referenceId?: string | undefined;
  paymentId?: string | undefined;
  amountPaise?: number | undefined;
  amountPaidPaise?: number | undefined;
  refundId?: string | undefined;
}

function entity(payload: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const node = payload[key] as { entity?: Record<string, unknown> } | undefined;
  return node?.entity;
}

export function parseRazorpayEvent(body: unknown): ParsedEvent {
  if (!body || typeof body !== 'object') return { kind: 'ignored' };
  const evt = body as { event?: string; payload?: Record<string, unknown> };
  const payload = evt.payload ?? {};

  switch (evt.event) {
    case 'payment_link.paid':
    case 'payment_link.partially_paid': {
      const link = entity(payload, 'payment_link');
      const pay = entity(payload, 'payment');
      return {
        kind: evt.event === 'payment_link.paid' ? 'payment_link_paid' : 'payment_link_partially_paid',
        linkId: link?.['id'] as string | undefined,
        referenceId: link?.['reference_id'] as string | undefined,
        amountPaise: link?.['amount'] as number | undefined,
        amountPaidPaise: link?.['amount_paid'] as number | undefined,
        paymentId: pay?.['id'] as string | undefined,
      };
    }
    case 'payment_link.cancelled':
    case 'payment_link.expired': {
      const link = entity(payload, 'payment_link');
      return { kind: 'payment_link_closed', linkId: link?.['id'] as string | undefined };
    }
    case 'refund.processed':
    case 'refund.failed': {
      const refund = entity(payload, 'refund');
      return {
        kind: evt.event === 'refund.processed' ? 'refund_processed' : 'refund_failed',
        refundId: refund?.['id'] as string | undefined,
        paymentId: refund?.['payment_id'] as string | undefined,
        amountPaise: refund?.['amount'] as number | undefined,
      };
    }
    default:
      return { kind: 'ignored' };
  }
}
