'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { checkRoomConflict } from '@/lib/utils/conflict';
import { daysBetween } from '@/lib/utils/date';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUESTER_ROLES = ['Sales', 'Sales Admin', 'Admin'];
const APPROVER_ROLES = ['Sales Admin', 'Admin'];

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

function revalidateRequestPaths() {
  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
}

async function hasOpenRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  type: 'cancellation' | 'postponement',
): Promise<boolean> {
  const { data } = await supabase
    .from('booking_requests')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('type', type)
    .in('status', ['pending', 'approved'])
    .limit(1);
  return (data ?? []).length > 0;
}

// ---------- requestCancellation ----------

export async function requestCancellation(
  bookingId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  if (!bookingId) return err('Booking ID required');
  if (!reason.trim()) return err('A cancellation reason is required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!REQUESTER_ROLES.includes(actor.role)) return err('Insufficient permissions');

  const { data: bk } = await supabase
    .from('bookings').select('status, booking_type').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');
  if (bk['status'] === 'cancelled') return err('This booking is already cancelled.');
  if (bk['booking_type'] === 'corporate') return err('Cancel corporate bookings from the Corporate tab.');
  if (await hasOpenRequest(supabase, bookingId, 'cancellation')) {
    return err('A cancellation request is already open for this booking.');
  }

  const id = `REQ-${Date.now()}`;
  const { error } = await supabase.from('booking_requests').insert({
    id, booking_id: bookingId, type: 'cancellation', status: 'pending',
    reason: reason.trim(), payload: null,
    requested_by: actor.name, requested_at: new Date().toISOString(),
  });
  if (error) { console.error('[requestCancellation]', error); return err('Failed to submit request.'); }

  revalidateRequestPaths();
  return ok({ id });
}

// ---------- requestPostponement ----------

export async function requestPostponement(
  bookingId: string,
  arrival: string,
  departure: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  if (!bookingId) return err('Booking ID required');
  if (!DATE_RE.test(arrival) || !DATE_RE.test(departure)) return err('Valid new dates are required');
  if (departure <= arrival) return err('Departure must be after arrival');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!REQUESTER_ROLES.includes(actor.role)) return err('Insufficient permissions');

  const { data: bk } = await supabase
    .from('bookings').select('status, booking_type, rooms').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');
  if (bk['status'] === 'cancelled') return err('This booking is cancelled.');
  if (bk['booking_type'] === 'corporate') return err('Postpone corporate bookings from the Corporate tab.');
  if (await hasOpenRequest(supabase, bookingId, 'postponement')) {
    return err('A postponement request is already open for this booking.');
  }

  // Pre-check the new dates so we never queue an impossible move. Re-checked again
  // at apply time, since rooms can be taken between request and approval.
  const conflict = await checkRoomConflict(
    supabase, (bk['rooms'] as string[]) ?? [], arrival, departure, bookingId,
  );
  if (conflict) return err(conflict);

  const nights = daysBetween(arrival, departure);
  const id = `REQ-${Date.now()}`;
  const { error } = await supabase.from('booking_requests').insert({
    id, booking_id: bookingId, type: 'postponement', status: 'pending',
    reason: reason.trim(), payload: { arrival, departure, nights },
    requested_by: actor.name, requested_at: new Date().toISOString(),
  });
  if (error) { console.error('[requestPostponement]', error); return err('Failed to submit request.'); }

  revalidateRequestPaths();
  return ok({ id });
}

// ---------- decideRequest (approve / reject) ----------

export async function decideRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
): Promise<ActionResult> {
  if (!requestId) return err('Request ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!APPROVER_ROLES.includes(actor.role)) return err('Only Sales Admin and Admin can approve requests');

  const { data: req } = await supabase
    .from('booking_requests').select('*').eq('id', requestId).single();
  if (!req) return err('Request not found');
  if (req['status'] !== 'pending') return err('This request has already been decided.');

  const now = new Date().toISOString();

  if (decision === 'rejected') {
    const { error } = await supabase.from('booking_requests')
      .update({ status: 'rejected', decided_by: actor.name, decided_at: now })
      .eq('id', requestId);
    if (error) { console.error('[decideRequest reject]', error); return err('Failed to reject request.'); }
    revalidateRequestPaths();
    return ok(undefined);
  }

  const bookingId = req['booking_id'] as string;

  if (req['type'] === 'cancellation') {
    // Approval cancels the booking now (frees rooms). Refund is a separate follow-up.
    const { data: current } = await supabase
      .from('bookings').select('*').eq('id', bookingId).single();
    if (!current) return err('Booking not found');
    if (current['status'] === 'cancelled') return err('Booking is already cancelled.');

    const { error: upBk } = await supabase.from('bookings').update({
      status: 'cancelled', hold_expires_at: null,
      cancellation_reason: req['reason'] ?? '', cancelled_by: actor.name, cancelled_at: now,
    }).eq('id', bookingId);
    if (upBk) { console.error('[decideRequest cancel]', upBk); return err('Failed to cancel booking.'); }

    await supabase.from('booking_history').insert({
      id: `BH-${Date.now()}`, booking_id: bookingId, changed_by: actor.name, changed_at: now,
      changes: { status: { from: current['status'], to: 'cancelled' } },
      snapshot: { ...current, status: 'cancelled' },
    }).then(({ error: hErr }) => { if (hErr) console.error('[booking_history]', hErr); });
  }
  // Postponement: approval just unlocks "apply" for the agent; dates change at apply time.

  const { error } = await supabase.from('booking_requests')
    .update({ status: 'approved', decided_by: actor.name, decided_at: now })
    .eq('id', requestId);
  if (error) { console.error('[decideRequest approve]', error); return err('Failed to approve request.'); }

  revalidateRequestPaths();
  revalidatePath('/accounts');
  return ok(undefined);
}

// ---------- applyPostponement ----------

export async function applyPostponement(requestId: string): Promise<ActionResult> {
  if (!requestId) return err('Request ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!REQUESTER_ROLES.includes(actor.role)) return err('Insufficient permissions');

  const { data: req } = await supabase
    .from('booking_requests').select('*').eq('id', requestId).single();
  if (!req) return err('Request not found');
  if (req['type'] !== 'postponement') return err('Not a postponement request.');
  if (req['status'] !== 'approved') return err('This postponement must be approved before it can be applied.');

  const payload = req['payload'] as { arrival?: string; departure?: string; nights?: number } | null;
  if (!payload?.arrival || !payload.departure) return err('Postponement is missing its new dates.');

  const bookingId = req['booking_id'] as string;
  const { data: current } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (!current) return err('Booking not found');
  if (current['status'] === 'cancelled') return err('Booking is cancelled.');

  // Rooms may have been taken since approval — re-check before committing the move.
  const conflict = await checkRoomConflict(
    supabase, (current['rooms'] as string[]) ?? [], payload.arrival, payload.departure, bookingId,
  );
  if (conflict) return err(conflict);

  const now = new Date().toISOString();
  const nights = payload.nights ?? daysBetween(payload.arrival, payload.departure);
  const { error: upBk } = await supabase.from('bookings')
    .update({ arrival: payload.arrival, departure: payload.departure, nights })
    .eq('id', bookingId);
  if (upBk) { console.error('[applyPostponement]', upBk); return err('Failed to apply postponement.'); }

  await supabase.from('booking_history').insert({
    id: `BH-${Date.now()}`, booking_id: bookingId, changed_by: actor.name, changed_at: now,
    changes: {
      arrival: { from: current['arrival'], to: payload.arrival },
      departure: { from: current['departure'], to: payload.departure },
    },
    snapshot: { ...current, arrival: payload.arrival, departure: payload.departure, nights },
  }).then(({ error: hErr }) => { if (hErr) console.error('[booking_history]', hErr); });

  const { error } = await supabase.from('booking_requests')
    .update({ status: 'completed', completed_by: actor.name, completed_at: now })
    .eq('id', requestId);
  if (error) { console.error('[applyPostponement complete]', error); return err('Postponed, but failed to close the request.'); }

  revalidateRequestPaths();
  return ok(undefined);
}
