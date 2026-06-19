import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaymentLink } from '@/lib/server/razorpay';
import { toPaise, fromPaise } from '@/lib/utils/money';
import { buildReferenceId, computeAdvance, nextLinkVersion } from '@/lib/server/transaction-helpers';
import { paymentLinkToDb } from '@/lib/mappers/transactions';
import { paymentToDb } from '@/lib/mappers/payment';
import { sendPaymentRequest, sendPaymentReceipt, type MsgBooking } from '@/lib/server/messaging';
import { onPaymentVerified, syncEnquiryStageFromPayment } from '@/lib/server/payment-sync';
import { ADVANCE_DEFAULT_PCT_KEY, ADVANCE_DEFAULT_PCT_FALLBACK, purposeToPaymentType, type PaymentLinkPurpose } from '@/lib/constants/transactions';
import type { ParsedEvent } from '@/lib/server/razorpay-events';
import type { Payment } from '@/lib/types/payment';

async function advancePct(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('meta').select('value').eq('key', ADVANCE_DEFAULT_PCT_KEY).single();
  const n = data ? Number(data.value) : NaN;
  return Number.isFinite(n) ? n : ADVANCE_DEFAULT_PCT_FALLBACK;
}

function toMsgBooking(row: Record<string, unknown>): MsgBooking {
  return {
    id: row['id'] as string,
    guestName: (row['guest_name'] as string) || 'Guest',
    contactNumber: (row['contact_number'] as string) || '',
    email: (row['email'] as string) || '',
    confirmationNumber: (row['confirmation_number'] as string) || '',
    enquiryId: (row['source_enquiry_id'] as string | null) ?? null,
  };
}

async function createAndSendLink(
  supabase: SupabaseClient,
  opts: { row: Record<string, unknown>; purpose: PaymentLinkPurpose; amountRupees: number; actor: string },
): Promise<{ shortUrl: string }> {
  const { row, purpose, amountRupees, actor } = opts;
  const bookingId = row['id'] as string;
  if (!(amountRupees > 0)) throw new Error('Amount must be greater than zero');

  // Idempotent reference id: bump version past any existing link for this (booking, purpose).
  const { data: existing } = await supabase.from('payment_links').select('reference_id').eq('booking_id', bookingId);
  const refs = (existing ?? []).map((r) => r['reference_id'] as string);
  const version = nextLinkVersion(refs, bookingId, purpose);
  const referenceId = buildReferenceId(bookingId, purpose, version);

  const booking = toMsgBooking(row);
  const created = await createPaymentLink({
    amountPaise: toPaise(amountRupees),
    referenceId,
    description: `${purpose.replace('_', ' ')} · ${booking.confirmationNumber}`,
    customer: {
      name: booking.guestName,
      ...(booking.contactNumber ? { contact: booking.contactNumber } : {}),
      ...(booking.email ? { email: booking.email } : {}),
    },
    notes: { bookingId, purpose, confirmationNumber: booking.confirmationNumber },
  });

  const id = `PL-${Date.now()}`;
  const { error } = await supabase.from('payment_links').insert(paymentLinkToDb({
    id, bookingId, enquiryId: booking.enquiryId ?? null, purpose, referenceId,
    razorpayLinkId: created.id, shortUrl: created.shortUrl, amount: toPaise(amountRupees),
    amountPaid: 0, currency: 'INR', status: 'sent',
    notes: { confirmationNumber: booking.confirmationNumber }, createdBy: actor,
  }));
  if (error) throw new Error(`Failed to persist payment link: ${error.message}`);

  await sendPaymentRequest(supabase, booking, amountRupees, created.shortUrl);
  return { shortUrl: created.shortUrl };
}

export async function requestAdvance(
  supabase: SupabaseClient, bookingId: string, opts?: { amountRupees?: number; actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, total_amount, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');

  const total = Number(row['total_amount'] ?? 0);
  if (!(total > 0)) throw new Error('Set the package total before requesting an advance.');

  const amount = opts?.amountRupees ?? computeAdvance(total, await advancePct(supabase));
  if (amount > total) throw new Error('Advance cannot exceed the total amount.');

  return createAndSendLink(supabase, {
    row, purpose: 'advance', amountRupees: amount, actor: opts?.actor ?? 'system',
  });
}

export async function requestCorporateAdvance(
  supabase: SupabaseClient, bookingId: string, opts?: { actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, proforma_invoice, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');
  if (row['booking_type'] !== 'corporate') throw new Error('Not a corporate booking');

  const pi = row['proforma_invoice'] as { advanceRequired?: number } | null;
  const advance = pi ? Number(pi.advanceRequired ?? 0) : 0;
  if (!(advance > 0)) throw new Error('Generate the proforma invoice (with an advance) first.');

  return createAndSendLink(supabase, {
    row, purpose: 'corporate_advance', amountRupees: advance, actor: opts?.actor ?? 'system',
  });
}

// Outstanding = total (or final bill) − verified payments, in rupees.
export async function requestBalance(
  supabase: SupabaseClient, bookingId: string, opts?: { amountRupees?: number; actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, total_amount, final_bill, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');

  const finalBill = row['final_bill'] as { totalAmount?: number } | null;
  const billTotal = finalBill && Number(finalBill.totalAmount ?? 0) > 0
    ? Number(finalBill.totalAmount) : Number(row['total_amount'] ?? 0);

  const { data: pays } = await supabase.from('payments')
    .select('amount, verified, type').eq('booking_id', bookingId);
  const paid = (pays ?? [])
    .filter((p) => p['verified'] === true && p['type'] !== 'refund')
    .reduce((s, p) => s + Number(p['amount'] ?? 0), 0);

  const outstanding = Math.max(0, Math.round(billTotal - paid));
  const amount = opts?.amountRupees ?? outstanding;
  if (!(amount > 0)) throw new Error('Nothing outstanding to collect.');
  if (amount > outstanding) throw new Error('Amount exceeds the outstanding balance.');

  const purpose = finalBill && Number(finalBill.totalAmount ?? 0) > 0 ? 'final_bill' : 'balance';
  return createAndSendLink(supabase, { row, purpose, amountRupees: amount, actor: opts?.actor ?? 'system' });
}

const SYSTEM_ACTOR = { id: 'razorpay-webhook', name: 'Razorpay (auto)' };

// Records a captured Razorpay payment into the ledger (idempotent), advances enquiry/corporate
// state, but does NOT confirm the booking — that stays a human click (bookEnquiry).
export async function onPaymentLinkPaid(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.linkId || !ev.paymentId) return;

  const { data: link } = await supabase.from('payment_links').select('*').eq('razorpay_link_id', ev.linkId).single();
  if (!link) { console.error('[onPaymentLinkPaid] no link for', ev.linkId); return; }

  const bookingId = link['booking_id'] as string;
  const amountRupees = fromPaise(ev.amountPaise ?? Number(link['amount']));

  // Idempotency: a unique index guards razorpay_payment_id, but check first to avoid a noisy error.
  const { data: dup } = await supabase.from('payments').select('id').eq('razorpay_payment_id', ev.paymentId).maybeSingle();
  if (dup) return;

  const now = new Date().toISOString();
  const payment: Payment = {
    id: `PAY-${Date.now()}`,
    bookingId,
    paymentDate: now.slice(0, 10),
    amount: amountRupees,
    mode: 'razorpay',
    reference: ev.paymentId,
    type: purposeToPaymentType(link['purpose'] as PaymentLinkPurpose),
    notes: `Razorpay ${link['purpose']} · link ${ev.linkId}`,
    verified: true,
    verifiedBy: SYSTEM_ACTOR.name,
    verifiedAt: now,
    recordedAt: now,
    recordedBy: SYSTEM_ACTOR.name,
    recordedByRole: 'System',
    refundStatus: null,
  };
  const dbRow = { ...paymentToDb(payment), razorpay_payment_id: ev.paymentId, razorpay_link_id: ev.linkId };
  // The unique index on razorpay_payment_id is the real idempotency backstop: a concurrent
  // replay that slips past the maybeSingle check will trip 23505 — swallow it, don't 500
  // (re-processing the webhook would otherwise double-verify and re-advance state).
  const { error: insErr } = await supabase.from('payments').insert(dbRow);
  if (insErr) {
    if (insErr.code === '23505') return; // duplicate payment — already recorded
    console.error('[onPaymentLinkPaid] insert', insErr);
    return;
  }

  await supabase.from('payment_links').update({
    status: 'paid', amount_paid: ev.amountPaidPaise ?? Number(link['amount']),
    paid_at: now, updated_at: now,
  }).eq('id', link['id']);

  await onPaymentVerified(supabase, bookingId, amountRupees, SYSTEM_ACTOR);
  await syncEnquiryStageFromPayment(supabase, bookingId);

  await sendPaymentReceipt(supabase, toMsgBooking(
    (await supabase.from('bookings')
      .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id')
      .eq('id', bookingId).single()).data as Record<string, unknown>,
  ), amountRupees);
}

export async function onPaymentLinkPartiallyPaid(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.linkId) return;
  await supabase.from('payment_links').update({
    status: 'partially_paid', amount_paid: ev.amountPaidPaise ?? 0, updated_at: new Date().toISOString(),
  }).eq('razorpay_link_id', ev.linkId);
  // Deliberately NO auto-verify on a short advance — a human reconciles partials.
}
