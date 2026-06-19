import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToPaymentLink(r: Record<string, any>): PaymentLink {
  return {
    id: r['id'], bookingId: r['booking_id'], enquiryId: r['enquiry_id'] ?? null,
    purpose: r['purpose'], referenceId: r['reference_id'],
    razorpayLinkId: r['razorpay_link_id'] ?? null, shortUrl: r['short_url'] ?? null,
    amount: Number(r['amount']), amountPaid: Number(r['amount_paid'] ?? 0),
    currency: r['currency'] ?? 'INR', status: r['status'],
    expiresAt: r['expires_at'] ?? null, notes: r['notes'] ?? null,
    createdBy: r['created_by'] ?? 'system', createdAt: r['created_at'],
    paidAt: r['paid_at'] ?? null, updatedAt: r['updated_at'],
  };
}

export function paymentLinkToDb(p: Partial<PaymentLink> & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { id: p.id };
  if (p.bookingId !== undefined) out['booking_id'] = p.bookingId;
  if (p.enquiryId !== undefined) out['enquiry_id'] = p.enquiryId;
  if (p.purpose !== undefined) out['purpose'] = p.purpose;
  if (p.referenceId !== undefined) out['reference_id'] = p.referenceId;
  if (p.razorpayLinkId !== undefined) out['razorpay_link_id'] = p.razorpayLinkId;
  if (p.shortUrl !== undefined) out['short_url'] = p.shortUrl;
  if (p.amount !== undefined) out['amount'] = p.amount;
  if (p.amountPaid !== undefined) out['amount_paid'] = p.amountPaid;
  if (p.currency !== undefined) out['currency'] = p.currency;
  if (p.status !== undefined) out['status'] = p.status;
  if (p.expiresAt !== undefined) out['expires_at'] = p.expiresAt;
  if (p.notes !== undefined) out['notes'] = p.notes;
  if (p.createdBy !== undefined) out['created_by'] = p.createdBy;
  if (p.paidAt !== undefined) out['paid_at'] = p.paidAt;
  out['updated_at'] = new Date().toISOString();
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToOutboundMessage(r: Record<string, any>): OutboundMessage {
  return {
    id: r['id'], bookingId: r['booking_id'] ?? null, enquiryId: r['enquiry_id'] ?? null,
    channel: r['channel'], purpose: r['purpose'], template: r['template'] ?? null,
    destination: r['destination'] ?? '', provider: r['provider'] ?? null,
    providerMessageId: r['provider_message_id'] ?? null, status: r['status'],
    error: r['error'] ?? null, payload: r['payload'] ?? null,
    createdAt: r['created_at'], updatedAt: r['updated_at'],
  };
}

export function outboundMessageToDb(m: Partial<OutboundMessage> & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { id: m.id };
  if (m.bookingId !== undefined) out['booking_id'] = m.bookingId;
  if (m.enquiryId !== undefined) out['enquiry_id'] = m.enquiryId;
  if (m.channel !== undefined) out['channel'] = m.channel;
  if (m.purpose !== undefined) out['purpose'] = m.purpose;
  if (m.template !== undefined) out['template'] = m.template;
  if (m.destination !== undefined) out['destination'] = m.destination;
  if (m.provider !== undefined) out['provider'] = m.provider;
  if (m.providerMessageId !== undefined) out['provider_message_id'] = m.providerMessageId;
  if (m.status !== undefined) out['status'] = m.status;
  if (m.error !== undefined) out['error'] = m.error;
  if (m.payload !== undefined) out['payload'] = m.payload;
  out['updated_at'] = new Date().toISOString();
  return out;
}
