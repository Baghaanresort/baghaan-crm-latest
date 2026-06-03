'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { PaymentSchema } from '@/lib/validations/booking';
import { paymentToDb } from '@/lib/mappers/payment';
import { FO_AUTO_VERIFY_MODES } from '@/lib/constants/payments';
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
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
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
  };

  const { error } = await supabase.from('payments').insert(paymentToDb(payment));
  if (error) {
    console.error('[addPayment]', error);
    return err('Failed to record payment. Please try again.');
  }

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

  const { error } = await supabase
    .from('payments')
    .update({ verified: false, verified_at: null, verified_by: null })
    .eq('id', paymentId);

  if (error) {
    console.error('[unverifyPayment]', error);
    return err('Failed to un-verify payment.');
  }

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

  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) {
    console.error('[deletePayment]', error);
    return err('Failed to delete payment.');
  }

  revalidatePaymentPaths();
  return ok(undefined);
}
