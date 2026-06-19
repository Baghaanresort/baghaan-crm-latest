'use server';

import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { sendVoucher, type MsgBooking } from '@/lib/server/messaging';
import { getVoucherShareUrl } from '@/lib/actions/vouchers';

export async function dispatchVoucher(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();

  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id')
    .eq('id', bookingId).single();
  if (!row) return err('Booking not found');

  const booking: MsgBooking = {
    id: row['id'] as string,
    guestName: (row['guest_name'] as string) || 'Guest',
    contactNumber: (row['contact_number'] as string) || '',
    email: (row['email'] as string) || '',
    confirmationNumber: (row['confirmation_number'] as string) || '',
    enquiryId: (row['source_enquiry_id'] as string | null) ?? null,
  };

  const voucherUrl = await getVoucherShareUrl(bookingId);
  await sendVoucher(supabase, booking, voucherUrl); // never throws; logs per-channel
  return ok(undefined);
}
