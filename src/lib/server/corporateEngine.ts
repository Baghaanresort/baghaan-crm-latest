import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { corporateStageStep } from '@/lib/constants/corporate';
import type { CorporateStage } from '@/lib/types/booking';

type SB = Awaited<ReturnType<typeof createClient>>;
type Actor = { id: string; name: string };

// Append-only activity entry for a corporate booking. Never throws — logging
// failures must not break the action that triggered them.
export async function logCorporateActivity(
  supabase: SB,
  bookingId: string,
  type: string,
  message: string,
  actor: Actor,
): Promise<void> {
  const { error } = await supabase.from('corporate_activity').insert({
    id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    booking_id: bookingId,
    type,
    message,
    actor: actor.name,
    actor_id: actor.id,
    created_at: new Date().toISOString(),
  });
  if (error) console.error('[logCorporateActivity]', error);
}

// Pipeline automation — corporate bookings only, forward-only. Called after any
// payment is verified (or auto-verified). Promotes the stage when the money
// crosses a threshold and records what happened:
//   • verified advance ≥ PI advance (or any verified payment if no PI) → Confirmed
//     (and books the rooms by setting booking status = 'confirmed')
//   • final bill fully settled                                          → Completed
export async function runCorporateAutomation(
  supabase: SB,
  bookingId: string,
  actor: Actor,
): Promise<void> {
  const { data: row } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (!row || row['booking_type'] !== 'corporate') return;

  const booking = dbToBooking(row);
  const { data: payRows } = await supabase.from('payments').select('*').eq('booking_id', bookingId);
  // Verification removed: count all recorded payments toward the corporate advance/bill.
  const verifiedPaid = (payRows ?? []).map(dbToPayment)
    .reduce((s, p) => s + p.amount, 0);

  const advanceRequired = booking.proformaInvoice?.advanceRequired ?? 0;
  const hasFinalBill = !!booking.finalBill && Number(booking.finalBill.totalAmount ?? 0) > 0;
  const billAmount = hasFinalBill ? Number(booking.finalBill!.totalAmount) : booking.totalAmount;
  const balance = billAmount - verifiedPaid;

  const current = (booking.corporateStage ?? 'inquiry') as CorporateStage;
  const curStep = corporateStageStep(current);

  let target: CorporateStage = current;
  const advanceMet = advanceRequired > 0 ? verifiedPaid >= advanceRequired : verifiedPaid > 0;
  if (advanceMet && corporateStageStep('confirmed') > corporateStageStep(target)) target = 'confirmed';
  if (hasFinalBill && balance <= 0 && corporateStageStep('completed') > corporateStageStep(target)) target = 'completed';

  if (corporateStageStep(target) <= curStep) return; // forward-only; nothing to do

  const update: Record<string, unknown> = { corporate_stage: target };
  // Reaching confirmed commits the rooms. Don't downgrade an already checked-in stay.
  if (corporateStageStep(target) >= corporateStageStep('confirmed') && booking.status === 'hold') {
    update['status'] = 'confirmed';
  }
  const { error } = await supabase.from('bookings').update(update).eq('id', bookingId);
  if (error) { console.error('[runCorporateAutomation]', error); return; }

  if (curStep < corporateStageStep('confirmed') && corporateStageStep(target) >= corporateStageStep('confirmed')) {
    await logCorporateActivity(supabase, bookingId, 'confirmed',
      `Advance verified — booking confirmed (₹${verifiedPaid.toLocaleString('en-IN')} received).`, actor);
  }
  if (target === 'completed') {
    await logCorporateActivity(supabase, bookingId, 'completed', 'Final bill settled — booking completed.', actor);
  }
}
