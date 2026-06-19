'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { requestAdvance } from '@/lib/server/transactionEngine';

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

export async function sendAdvanceRequest(
  bookingId: string, amountRupees?: number,
): Promise<ActionResult<{ shortUrl: string }>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can request payments');

  try {
    const opts: { actor: string; amountRupees?: number } = { actor: actor.name };
    if (amountRupees !== undefined) opts.amountRupees = amountRupees;
    const res = await requestAdvance(supabase, bookingId, opts);
    revalidatePath('/enquiries');
    revalidatePath('/bookings');
    return ok(res);
  } catch (e) {
    console.error('[sendAdvanceRequest]', e);
    return err(e instanceof Error ? e.message : 'Failed to create payment link');
  }
}
