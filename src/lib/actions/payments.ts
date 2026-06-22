'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { PaymentSchema } from '@/lib/validations/booking';
import { paymentToDb } from '@/lib/mappers/payment';
import { onPaymentVerified, syncEnquiryStageFromPayment } from '@/lib/server/payment-sync';
import type { Payment } from '@/lib/types/payment';

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

  const payment: Payment = {
    id,
    bookingId: parsed.data.bookingId,
    paymentDate: parsed.data.paymentDate,
    amount: parsed.data.amount,
    mode: parsed.data.mode,
    reference: parsed.data.reference ?? '',
    type: parsed.data.type,
    notes: parsed.data.notes ?? '',
    // Verification removed: every recorded payment counts immediately.
    verified: true,
    verifiedBy: actor.name,
    verifiedAt: now,
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

  // Every recorded payment counts now — run corporate stage automation.
  await onPaymentVerified(supabase, payment.bookingId, payment.amount, actor);

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
