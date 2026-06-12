'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { PaymentSchema } from '@/lib/validations/booking';
import { paymentToDb } from '@/lib/mappers/payment';
import { FO_AUTO_VERIFY_MODES } from '@/lib/constants/payments';
import { logCorporateActivity, runCorporateAutomation } from '@/lib/server/corporateEngine';
import type { Payment } from '@/lib/types/payment';

// Logs a verified payment + runs corporate stage automation when the booking is
// corporate. No-op (cheaply) for regular bookings — the engine guards on type.
async function onPaymentVerified(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
async function syncEnquiryStageFromPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const hasVerified = relevant.some(p => p['verified'] === true);
  const hasAny = relevant.length > 0;

  const stage = hasVerified ? 'advance_confirmed' : hasAny ? 'advance_pending' : 'rooms_blocked';

  await supabase
    .from('enquiries')
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq('id', enquiryId)
    .eq('held_booking_id', bookingId); // guard: only the live hold
  revalidatePath('/enquiries');
}

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

function revalidatePaymentPaths() {
  revalidatePath('/dashboard');
  revalidatePath('/bookings');
  revalidatePath('/accounts');
  revalidatePath('/front-office');
  revalidatePath('/corporate');
}

// ---------- addPayment ----------

export async function addPayment(
  input: z.infer<typeof PaymentSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = PaymentSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  // An enquiry-linked hold may have been blocked without a quote, so its package
  // total can still be ₹0. An advance is a slice of a known total, so require the
  // total here and persist it onto the booking before recording the payment. This
  // guarantees `total_amount > 0` by the time the hold is booked (a voucher goes out).
  const { data: bk } = await supabase
    .from('bookings')
    .select('source_enquiry_id, status, total_amount')
    .eq('id', parsed.data.bookingId)
    .single();

  if (bk?.['source_enquiry_id'] && bk['status'] === 'hold') {
    const effectiveTotal = parsed.data.totalAmount ?? Number(bk['total_amount'] ?? 0);
    if (effectiveTotal <= 0) {
      return err('Enter the total package amount before recording an advance for this enquiry hold.');
    }
    if (parsed.data.totalAmount !== undefined && parsed.data.totalAmount !== Number(bk['total_amount'] ?? 0)) {
      const { error: upErr } = await supabase
        .from('bookings')
        .update({ total_amount: parsed.data.totalAmount })
        .eq('id', parsed.data.bookingId);
      if (upErr) {
        console.error('[addPayment total_amount]', upErr);
        return err('Failed to save the total package amount. Please try again.');
      }
    }
  }

  const now = new Date().toISOString();
  const id = `PAY-${Date.now()}`;

  // Auto-verify logic: FO role + Cash/Card/Debit Card = verified immediately
  const isAutoVerify = actor.role === 'Front Office' && FO_AUTO_VERIFY_MODES.has(parsed.data.mode);

  const payment: Payment = {
    id,
    bookingId: parsed.data.bookingId,
    paymentDate: parsed.data.paymentDate,
    amount: parsed.data.amount,
    mode: parsed.data.mode,
    reference: parsed.data.reference ?? '',
    type: parsed.data.type,
    notes: parsed.data.notes ?? '',
    verified: isAutoVerify,
    verifiedBy: isAutoVerify ? actor.name : null,
    verifiedAt: isAutoVerify ? now : null,
    recordedAt: now,
    recordedBy: actor.name,
    recordedByRole: actor.role,
    refundStatus: null,
  };

  const { error } = await supabase.from('payments').insert(paymentToDb(payment));
  if (error) {
    console.error('[addPayment]', error);
    return err('Failed to record payment. Please try again.');
  }

  // FO cash/card payments are verified on the spot — run corporate automation now.
  if (isAutoVerify) {
    await onPaymentVerified(supabase, payment.bookingId, payment.amount, actor);
  }

  await syncEnquiryStageFromPayment(supabase, payment.bookingId);
  revalidatePaymentPaths();
  return ok({ id });
}

// ---------- verifyPayment ----------

export async function verifyPayment(paymentId: string): Promise<ActionResult> {
  if (!paymentId) return err('Payment ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Accounts', 'Admin'].includes(actor.role)) {
    return err('Only Accounts and Admin can verify payments');
  }

  const { data: pay } = await supabase.from('payments').select('booking_id, amount').eq('id', paymentId).single();

  const { error } = await supabase
    .from('payments')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: actor.name,
    })
    .eq('id', paymentId);

  if (error) {
    console.error('[verifyPayment]', error);
    return err('Failed to verify payment.');
  }

  if (pay?.['booking_id']) {
    await onPaymentVerified(supabase, pay['booking_id'] as string, Number(pay['amount'] ?? 0), actor);
    await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
  }

  revalidatePaymentPaths();
  return ok(undefined);
}

// ---------- unverifyPayment ----------

export async function unverifyPayment(paymentId: string): Promise<ActionResult> {
  if (!paymentId) return err('Payment ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Accounts', 'Admin'].includes(actor.role)) {
    return err('Only Accounts and Admin can un-verify payments');
  }

  const { data: pay } = await supabase.from('payments').select('booking_id').eq('id', paymentId).single();

  const { error } = await supabase
    .from('payments')
    .update({ verified: false, verified_at: null, verified_by: null })
    .eq('id', paymentId);

  if (error) {
    console.error('[unverifyPayment]', error);
    return err('Failed to un-verify payment.');
  }

  if (pay?.['booking_id']) await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
  revalidatePaymentPaths();
  return ok(undefined);
}

// ---------- initiateRefund ----------

// Records an outgoing refund against a cancelled booking. Reuses the payments
// ledger (type='refund') so there's one money trail per booking. Created
// 'pending'; Accounts marks it 'done' once the money actually goes out.
export async function initiateRefund(input: {
  bookingId: string;
  amount: number;
  mode: string;
  reference?: string;
  paymentDate: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.bookingId) return err('Booking ID required');
  if (!(input.amount > 0)) return err('Refund amount must be greater than 0');
  if (!input.mode) return err('Refund mode is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) return err('Valid refund date is required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can initiate refunds');
  }

  const { data: bk } = await supabase.from('bookings').select('status').eq('id', input.bookingId).single();
  if (!bk) return err('Booking not found');
  if (bk['status'] !== 'cancelled') return err('Refunds can only be initiated on a cancelled booking.');

  const now = new Date().toISOString();
  const payment: Payment = {
    id: `PAY-${Date.now()}`,
    bookingId: input.bookingId,
    paymentDate: input.paymentDate,
    amount: input.amount,
    mode: input.mode,
    reference: input.reference?.trim() ?? '',
    type: 'refund',
    notes: input.notes?.trim() ?? '',
    verified: false,
    verifiedBy: null,
    verifiedAt: null,
    recordedAt: now,
    recordedBy: actor.name,
    recordedByRole: actor.role,
    refundStatus: 'pending',
  };

  const { error } = await supabase.from('payments').insert(paymentToDb(payment));
  if (error) { console.error('[initiateRefund]', error); return err('Failed to record refund.'); }

  revalidatePaymentPaths();
  return ok({ id: payment.id });
}

// ---------- markRefundDone ----------

export async function markRefundDone(paymentId: string): Promise<ActionResult> {
  if (!paymentId) return err('Refund ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Accounts', 'Admin'].includes(actor.role)) {
    return err('Only Accounts and Admin can complete refunds');
  }

  const { data: pay } = await supabase.from('payments').select('type, refund_status').eq('id', paymentId).single();
  if (!pay) return err('Refund not found');
  if (pay['type'] !== 'refund') return err('That payment is not a refund.');
  if (pay['refund_status'] === 'done') return err('This refund is already marked done.');

  const { error } = await supabase.from('payments').update({ refund_status: 'done' }).eq('id', paymentId);
  if (error) { console.error('[markRefundDone]', error); return err('Failed to update refund.'); }

  revalidatePaymentPaths();
  return ok(undefined);
}

// ---------- deletePayment ----------

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  if (!paymentId) return err('Payment ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Accounts', 'Admin'].includes(actor.role)) {
    return err('Only Accounts and Admin can delete payments');
  }

  const { data: pay } = await supabase.from('payments').select('booking_id').eq('id', paymentId).single();

  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) {
    console.error('[deletePayment]', error);
    return err('Failed to delete payment.');
  }

  if (pay?.['booking_id']) await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
  revalidatePaymentPaths();
  return ok(undefined);
}
