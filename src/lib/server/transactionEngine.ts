import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaymentLink } from '@/lib/server/razorpay';
import { toPaise } from '@/lib/utils/money';
import { buildReferenceId, computeAdvance, nextLinkVersion } from '@/lib/server/transaction-helpers';
import { paymentLinkToDb } from '@/lib/mappers/transactions';
import { sendPaymentRequest, type MsgBooking } from '@/lib/server/messaging';
import { ADVANCE_DEFAULT_PCT_KEY, ADVANCE_DEFAULT_PCT_FALLBACK, type PaymentLinkPurpose } from '@/lib/constants/transactions';

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
