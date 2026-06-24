'use server';

import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { sendVoucher, type MsgBooking } from '@/lib/server/messaging';
import { getVoucherShareUrl } from '@/lib/actions/vouchers';
import { getOrCreateVoucherPdf } from '@/lib/server/voucher-pdf-store';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { getBookingPaymentStatus } from '@/lib/utils/booking';

export async function dispatchVoucher(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();

  const { data: row } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (!row) return err('Booking not found');
  const full = dbToBooking(row);

  // Payment status drives the "Paid / Balance due" lines in the voucher email.
  const { data: payRows } = await supabase.from('payments').select('*').eq('booking_id', bookingId);
  const ps = getBookingPaymentStatus(full, (payRows ?? []).map(dbToPayment));

  const booking: MsgBooking = {
    id: full.id,
    guestName: full.guestName || 'Guest',
    contactNumber: full.contactNumber || '',
    email: full.email || '',
    confirmationNumber: full.confirmationNumber || '',
    enquiryId: full.sourceEnquiryId,
    arrival: full.arrival,
    departure: full.departure,
    nights: full.nights,
    rooms: full.rooms,
    adults: full.adults,
    children: full.children,
    companyName: full.companyName || undefined,
    totalAmount: ps.billAmount,
    paid: ps.totalPaid,
    balance: ps.balance,
  };

  // Generate + store the voucher PDF in Supabase Storage (S3). getOrCreateVoucherPdf
  // returns the bytes and primes the bucket; the download links serve the stored file.
  let pdf: Buffer | null = null;
  try { pdf = await getOrCreateVoucherPdf(bookingId); } catch { pdf = null; } // best-effort

  const voucherUrl = await getVoucherShareUrl(bookingId);
  await sendVoucher(supabase, booking, voucherUrl, pdf); // never throws; logs per-channel; attaches the PDF
  return ok(undefined);
}
