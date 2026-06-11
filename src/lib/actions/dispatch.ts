'use server';

import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';

/**
 * Voucher dispatch seam. SP1 records dispatch INTENT (status 'logged') for the email
 * and WhatsApp channels so the Vouchers tab can show it. SP2 replaces the body with
 * real Resend (email) + WhatsApp BSP sends and sets status 'sent'/'failed'. The
 * signature is stable so callers (bookEnquiry) never change.
 */
export async function dispatchVoucher(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();

  const { data: bk } = await supabase
    .from('bookings').select('email, contact_number').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');

  const now = new Date().toISOString();
  const rows = [
    { channel: 'email', destination: (bk['email'] as string) || '' },
    { channel: 'whatsapp', destination: (bk['contact_number'] as string) || '' },
  ].map((r, i) => ({
    id: `VD-${Date.now()}-${i}`,
    booking_id: bookingId,
    channel: r.channel,
    status: 'logged',
    destination: r.destination,
    detail: 'SP1: dispatch logged (sending not yet enabled)',
    created_at: now,
  }));

  const { error } = await supabase.from('voucher_dispatches').insert(rows);
  if (error) { console.error('[dispatchVoucher]', error); return err('Failed to log voucher dispatch.'); }
  return ok(undefined);
}
