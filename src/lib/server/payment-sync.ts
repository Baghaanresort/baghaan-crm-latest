import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { logCorporateActivity, runCorporateAutomation } from '@/lib/server/corporateEngine';

// Logs a verified payment + runs corporate stage automation when the booking is
// corporate. No-op (cheaply) for regular bookings — the engine guards on type.
// Client-agnostic: takes a SupabaseClient so both the cookie client (actions) and
// the admin client (webhook) can drive it.
export async function onPaymentVerified(
  supabase: SupabaseClient,
  bookingId: string,
  amount: number,
  actor: { id: string; name: string },
): Promise<void> {
  const { data: b } = await supabase.from('bookings').select('booking_type').eq('id', bookingId).single();
  if (b?.['booking_type'] === 'corporate') {
    await logCorporateActivity(supabase, bookingId, 'payment_verified', `Payment of ₹${amount.toLocaleString('en-IN')} verified.`, actor);
  }
  await runCorporateAutomation(supabase, bookingId, actor);
}

// Keep an enquiry's stage in lock-step with its held booking's payments.
// Idempotent: recomputes purely from current payment rows, so add/verify/unverify/
// delete all converge correctly. No-op for bookings with no source enquiry.
export async function syncEnquiryStageFromPayment(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: b } = await supabase
    .from('bookings')
    .select('source_enquiry_id, status')
    .eq('id', bookingId)
    .single();

  const enquiryId = b?.['source_enquiry_id'] as string | null;
  if (!enquiryId) return;
  // Once the booking is confirmed (Booked), payment edits don't move the enquiry.
  if (b?.['status'] !== 'hold') return;

  const { data: pays } = await supabase
    .from('payments')
    .select('verified')
    .eq('booking_id', bookingId);

  // The booking is a pre-arrival hold linked to an enquiry, so EVERY payment on it
  // is the advance — regardless of the PaymentModal's date-derived `type` (which can
  // default to 'balance'/'btc_receipt' for same-day or past arrivals). Don't filter
  // by type, or a valid advance is invisible and the enquiry stays at rooms_blocked.
  const relevant = pays ?? [];
  // Verification removed: any recorded payment confirms the advance (no pending state).
  const hasAny = relevant.length > 0;

  const stage = hasAny ? 'advance_confirmed' : 'rooms_blocked';

  await supabase
    .from('enquiries')
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq('id', enquiryId)
    .eq('held_booking_id', bookingId); // guard: only the live hold
  revalidatePath('/enquiries');
}
