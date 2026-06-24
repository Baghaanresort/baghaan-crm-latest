'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { EnquirySchema, UpdateEnquirySchema } from '@/lib/validations/enquiry';
import { enquiryToDb, dbToEnquiry } from '@/lib/mappers/enquiry';
import { bookingToDb } from '@/lib/mappers/booking';
import { generateConfirmationNumber } from '@/lib/utils/booking';
import { createBlockedRoom } from '@/lib/actions/bookings';
import { dispatchVoucher } from '@/lib/actions/dispatch';
import { EnquiryBlockSchema } from '@/lib/validations/enquiry-block';
import type { Enquiry } from '@/lib/types/enquiry';
import type { Booking } from '@/lib/types/booking';

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

async function getEnquiryCounter(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase.from('meta').select('value').eq('key', 'enquiry_counter').single();
  return data ? parseInt(data.value as string) : 0;
}

async function getBookingCounter(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase.from('meta').select('value').eq('key', 'booking_counter').single();
  return data ? parseInt(data.value as string) : 696;
}

function revalidateEnquiryPaths() {
  revalidatePath('/enquiries');
  revalidatePath('/dashboard');
}

// ---------- createEnquiry ----------

export async function createEnquiry(
  input: z.infer<typeof EnquirySchema>
): Promise<ActionResult<{ id: string; enquiryNumber: number }>> {
  const parsed = EnquirySchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can create enquiries');
  }

  const counter = await getEnquiryCounter(supabase);
  const newCounter = counter + 1;
  const id = `ENQ-${Date.now()}`;
  const now = new Date().toISOString();

  const enquiry: Enquiry = {
    id,
    enquiryNumber: newCounter,
    date: parsed.data.date,
    name: parsed.data.name ?? '',
    phone: parsed.data.phone,
    email: parsed.data.email ?? '',
    source: parsed.data.source,
    enquiryType: parsed.data.enquiryType ?? '',
    numberOfRooms: parsed.data.numberOfRooms ?? '',
    preferredDates: parsed.data.preferredDates ?? '',
    status: parsed.data.status,
    nextAction: parsed.data.nextAction ?? '',
    followupDate: parsed.data.followupDate ?? null,
    notes: parsed.data.notes ?? '',
    createdBy: parsed.data.createdBy || actor.name,
    updatedBy: actor.name,
    createdAt: now,
    updatedAt: now,
    linkedBookingId: null,
    heldBookingId: null,
    lostReason: '',
    lostAt: null,
  };

  const { error } = await supabase.from('enquiries').insert(enquiryToDb(enquiry));
  if (error) {
    console.error('[createEnquiry]', error);
    return err('Failed to create enquiry. Please try again.');
  }

  await supabase.from('meta').upsert({ key: 'enquiry_counter', value: String(newCounter) });

  // Auto-log creation activity
  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}`,
    enquiry_id: id,
    type: 'note',
    note: 'Enquiry created',
    created_by: actor.name,
    created_at: now,
  }).then(({ error: actErr }) => {
    if (actErr) console.error('[enquiry_activity create]', actErr);
  });

  revalidateEnquiryPaths();
  return ok({ id, enquiryNumber: newCounter });
}

// ---------- updateEnquiry ----------

export async function updateEnquiry(
  enquiryId: string,
  input: z.infer<typeof UpdateEnquirySchema>
): Promise<ActionResult> {
  if (!enquiryId) return err('Enquiry ID required');
  const parsed = UpdateEnquirySchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can update enquiries');
  }

  // Fetch current to detect status changes
  const { data: current } = await supabase
    .from('enquiries')
    .select('status, lost_reason')
    .eq('id', enquiryId)
    .single();

  const now = new Date().toISOString();
  const dbUpdates: Record<string, unknown> = {
    updated_by: actor.name,
    updated_at: now,
  };

  const d = parsed.data;
  if (d.date !== undefined) dbUpdates['date'] = d.date;
  if (d.name !== undefined) dbUpdates['name'] = d.name;
  if (d.phone !== undefined) dbUpdates['phone'] = d.phone;
  if (d.email !== undefined) dbUpdates['email'] = d.email;
  if (d.source !== undefined) dbUpdates['source'] = d.source;
  if (d.enquiryType !== undefined) dbUpdates['enquiry_type'] = d.enquiryType;
  if (d.numberOfRooms !== undefined) dbUpdates['number_of_rooms'] = d.numberOfRooms;
  if (d.preferredDates !== undefined) dbUpdates['preferred_dates'] = d.preferredDates;
  if (d.status !== undefined) dbUpdates['status'] = d.status;
  if (d.nextAction !== undefined) dbUpdates['next_action'] = d.nextAction;
  if (d.followupDate !== undefined) dbUpdates['followup_date'] = d.followupDate ?? null;
  if (d.notes !== undefined) dbUpdates['notes'] = d.notes;
  if (d.lostReason !== undefined) dbUpdates['lost_reason'] = d.lostReason;
  if (d.lostAt !== undefined) dbUpdates['lost_at'] = d.lostAt ?? null;

  // Auto-stamp lost_at when marking lost
  if (d.status === 'lost' && current?.['status'] !== 'lost') {
    dbUpdates['lost_at'] = now;
  }

  const { error } = await supabase.from('enquiries').update(dbUpdates).eq('id', enquiryId);
  if (error) {
    console.error('[updateEnquiry]', error);
    return err('Failed to update enquiry.');
  }

  // Auto-log status change
  if (d.status !== undefined && d.status !== current?.['status']) {
    const note = `Status changed to ${d.status}${d.lostReason ? ` — ${d.lostReason}` : ''}`;
    await supabase.from('enquiry_activities').insert({
      id: `ACT-${Date.now()}-s`,
      enquiry_id: enquiryId,
      type: 'status_change',
      note,
      created_by: actor.name,
      created_at: now,
    }).then(({ error: actErr }) => {
      if (actErr) console.error('[enquiry_activity status]', actErr);
    });
  }

  revalidateEnquiryPaths();
  return ok(undefined);
}

// ---------- deleteEnquiry — intentionally removed ----------
// Enquiries are a permanent audit record and must not be deletable. The delete
// action and UI were removed; deletes are also blocked at the DB layer by RLS
// (see supabase/migrations/002_lock_enquiry_delete.sql). Mark a lead "lost"
// instead of deleting it.

// ---------- convertEnquiryToBooking ----------

export async function convertEnquiryToBooking(enquiryId: string): Promise<
  ActionResult<{
    prefill: {
      guestName: string;
      contactNumber: string;
      email: string;
      remarks: string;
    };
    enquiryNumber: number;
    sourceEnquiryId: string;
  }>
> {
  if (!enquiryId) return err('Enquiry ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', enquiryId)
    .single();

  if (error || !data) return err('Enquiry not found');

  const enquiry = dbToEnquiry(data);

  return ok({
    prefill: {
      guestName: enquiry.name || '',
      contactNumber: enquiry.phone || '',
      email: enquiry.email || '',
      remarks: enquiry.notes
        ? `From enquiry #${enquiry.enquiryNumber}: ${enquiry.notes}`
        : `Converted from enquiry #${enquiry.enquiryNumber}`,
    },
    enquiryNumber: enquiry.enquiryNumber,
    sourceEnquiryId: enquiryId,
  });
}

// Called after booking is successfully saved — links the enquiry to the booking
export async function markEnquiryConverted(
  enquiryId: string,
  bookingId: string,
  confirmationNumber: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('enquiries')
    .update({
      status: 'booked',
      next_action: `Booking created · ${confirmationNumber}`,
      followup_date: null,
      linked_booking_id: bookingId,
      updated_by: actor.name,
      updated_at: now,
    })
    .eq('id', enquiryId);

  if (error) {
    console.error('[markEnquiryConverted]', error);
    return err('Failed to link enquiry to booking.');
  }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-c`,
    enquiry_id: enquiryId,
    type: 'booking_created',
    note: `Converted to booking ${confirmationNumber}`,
    created_by: actor.name,
    created_at: now,
  });

  revalidateEnquiryPaths();
  revalidatePath('/bookings');
  return ok(undefined);
}

// ---------- blockEnquiryRooms ----------

export async function blockEnquiryRooms(
  enquiryId: string,
  input: z.infer<typeof EnquiryBlockSchema>,
): Promise<ActionResult<{ bookingId: string; confirmationNumber: string }>> {
  if (!enquiryId) return err('Enquiry ID required');
  const parsed = EnquiryBlockSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can block rooms');

  const { data: enq } = await supabase
    .from('enquiries').select('name, phone, status, held_booking_id').eq('id', enquiryId).single();
  if (!enq) return err('Enquiry not found');
  if (enq['held_booking_id']) return err('This enquiry already has blocked rooms.');
  if (!['new', 'in_progress'].includes(enq['status'] as string)) {
    return err('Rooms can only be blocked from a New or In Progress lead.');
  }

  // Reuse the hold-booking creator; it runs checkRoomConflict and stamps the back-link.
  const blockRes = await createBlockedRoom({
    guestName: (enq['name'] as string) || 'Enquiry guest',
    contactNumber: (enq['phone'] as string) || '',
    arrival: parsed.data.arrival,
    departure: parsed.data.departure,
    nights: parsed.data.nights,
    adults: parsed.data.adults,
    children: parsed.data.children,
    rooms: parsed.data.rooms,
    quotedAmount: parsed.data.quotedAmount ?? 0,
    advanceRequired: parsed.data.advanceRequired ?? 0,
    addOns: parsed.data.addOns ?? [],
    roomCharges: parsed.data.roomCharges ?? [],
    notes: parsed.data.notes ?? '',
    createdBy: actor.name,
    holdExpiresAt: parsed.data.holdExpiresAt ?? null,
    sourceEnquiryId: enquiryId,
  });
  if (!blockRes.success) return err(blockRes.error);

  const now = new Date().toISOString();
  const { error } = await supabase.from('enquiries').update({
    status: 'rooms_blocked',
    held_booking_id: blockRes.data.id,
    next_action: `Rooms blocked · ${blockRes.data.confirmationNumber}`,
    updated_by: actor.name,
    updated_at: now,
  }).eq('id', enquiryId);
  if (error) { console.error('[blockEnquiryRooms]', error); return err('Failed to block rooms.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-b`, enquiry_id: enquiryId, type: 'note',
    note: `Rooms blocked: ${parsed.data.rooms.length} room(s), ${parsed.data.arrival}→${parsed.data.departure}`,
    created_by: actor.name, created_at: now,
  });

  revalidateEnquiryPaths();
  revalidatePath('/calendar');
  return ok({ bookingId: blockRes.data.id, confirmationNumber: blockRes.data.confirmationNumber });
}

// ---------- releaseEnquiryHold ----------

export async function releaseEnquiryHold(enquiryId: string): Promise<ActionResult> {
  if (!enquiryId) return err('Enquiry ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can release holds');

  const { data: enq } = await supabase
    .from('enquiries').select('held_booking_id, status').eq('id', enquiryId).single();
  if (!enq?.['held_booking_id']) return err('No active hold on this enquiry.');
  if (enq['status'] === 'booked') return err('This enquiry is already booked.');
  // Never release a hold the guest has paid on — cancel + refund explicitly instead.
  const { data: hp } = await supabase.from('payments').select('id, type').eq('booking_id', enq['held_booking_id'] as string).limit(5);
  if ((hp ?? []).some((p) => p['type'] !== 'refund')) {
    return err('This hold has a recorded payment — cancel the booking and process a refund instead of releasing.');
  }

  const now = new Date().toISOString();
  // Cancel the hold booking (keeps the record; frees the rooms from conflict checks
  // because checkRoomConflict ignores cancelled bookings).
  await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', enq['held_booking_id'] as string);
  const { error } = await supabase.from('enquiries').update({
    status: 'in_progress', held_booking_id: null, next_action: 'Hold released',
    updated_by: actor.name, updated_at: now,
  }).eq('id', enquiryId);
  if (error) { console.error('[releaseEnquiryHold]', error); return err('Failed to release hold.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-r`, enquiry_id: enquiryId, type: 'note',
    note: 'Room hold released', created_by: actor.name, created_at: now,
  });

  revalidateEnquiryPaths();
  revalidatePath('/calendar');
  revalidatePath('/bookings');
  return ok(undefined);
}

// ---------- bookEnquiry ----------

export async function bookEnquiry(
  enquiryId: string,
): Promise<ActionResult<{ bookingId: string; confirmationNumber: string }>> {
  if (!enquiryId) return err('Enquiry ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can book');

  const { data: enq } = await supabase
    .from('enquiries').select('held_booking_id, status').eq('id', enquiryId).single();
  if (!enq) return err('Enquiry not found');
  if (enq['status'] !== 'advance_confirmed') {
    return err('A verified advance payment is required before booking.');
  }
  const bookingId = enq['held_booking_id'] as string | null;
  if (!bookingId) return err('No held booking found for this enquiry.');

  const { data: bk } = await supabase
    .from('bookings').select('confirmation_number, status, total_amount').eq('id', bookingId).single();
  if (!bk) return err('Held booking missing.');
  if (bk['status'] !== 'hold') return err('Held booking is no longer holdable.');
  // A booking is the money-committed moment (voucher dispatches below). Never let a
  // ₹0 booking through — the total should already be set at the PAY step, but this
  // catches legacy holds blocked before that requirement existed.
  if (Number(bk['total_amount'] ?? 0) <= 0) {
    return err('Add the total package amount before booking. Open the hold and record it via the payment step.');
  }

  const now = new Date().toISOString();
  // Reuse the held record: hold → confirmed is the moment it enters the Bookings tab.
  const { error: upBk } = await supabase
    .from('bookings').update({ status: 'confirmed', hold_expires_at: null }).eq('id', bookingId);
  if (upBk) { console.error('[bookEnquiry booking]', upBk); return err('Failed to confirm booking.'); }

  const confirmationNumber = bk['confirmation_number'] as string;
  const { error: upEnq } = await supabase.from('enquiries').update({
    status: 'booked', linked_booking_id: bookingId, followup_date: null,
    next_action: `Booking confirmed · ${confirmationNumber}`,
    updated_by: actor.name, updated_at: now,
  }).eq('id', enquiryId);
  if (upEnq) { console.error('[bookEnquiry enquiry]', upEnq); return err('Booking confirmed but linking failed.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-bk`, enquiry_id: enquiryId, type: 'booking_created',
    note: `Converted to booking ${confirmationNumber}`, created_by: actor.name, created_at: now,
  });

  // Dispatch seam — SP1 logs intent; SP2 actually sends.
  await dispatchVoucher(bookingId);

  revalidateEnquiryPaths();
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/vouchers');
  return ok({ bookingId, confirmationNumber });
}

// ---------- sendVoucherAndConfirm ----------

// Sales sends the voucher — that single action confirms the booking. Requires an advance
// on the books. Flips hold → confirmed, marks the voucher sent, moves the enquiry to
// "Booking Confirmed", and dispatches the voucher. Re-sending on a confirmed booking just
// re-dispatches (no status regression). Booking-centric so the reminders panel can call it too.
export async function sendVoucherAndConfirm(bookingId: string): Promise<ActionResult<{ confirmationNumber: string }>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can send vouchers');

  const { data: bk } = await supabase
    .from('bookings').select('confirmation_number, status, total_amount, source_enquiry_id').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');
  const confirmationNumber = bk['confirmation_number'] as string;
  const now = new Date().toISOString();

  if (bk['status'] === 'hold') {
    if (Number(bk['total_amount'] ?? 0) <= 0) {
      return err('Add the total package amount before sending the voucher.');
    }
    const { data: pays } = await supabase.from('payments').select('id, type').eq('booking_id', bookingId);
    const hasAdvance = (pays ?? []).some((p) => p['type'] !== 'refund');
    if (!hasAdvance) return err('Record the advance payment before sending the voucher.');

    const { error: upBk } = await supabase.from('bookings')
      .update({ status: 'confirmed', hold_expires_at: null, voucher_sent: true, voucher_sent_at: now }).eq('id', bookingId);
    if (upBk) { console.error('[sendVoucherAndConfirm booking]', upBk); return err('Failed to confirm booking.'); }

    const enquiryId = bk['source_enquiry_id'] as string | null;
    if (enquiryId) {
      await supabase.from('enquiries').update({
        status: 'booked', linked_booking_id: bookingId, followup_date: null,
        next_action: `Voucher sent · booking confirmed · ${confirmationNumber}`,
        updated_by: actor.name, updated_at: now,
      }).eq('id', enquiryId);
      await supabase.from('enquiry_activities').insert({
        id: `ACT-${Date.now()}-vc`, enquiry_id: enquiryId, type: 'booking_created',
        note: `Voucher sent — booking confirmed ${confirmationNumber}`, created_by: actor.name, created_at: now,
      });
    }
  } else {
    // Already confirmed (or further along) — just record the voucher send and re-dispatch.
    await supabase.from('bookings').update({ voucher_sent: true, voucher_sent_at: now }).eq('id', bookingId);
  }

  await dispatchVoucher(bookingId);

  revalidateEnquiryPaths();
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/vouchers');
  return ok({ confirmationNumber });
}

// ---------- extendHold ----------

// Push a hold's expiry out by N days (Sales acting on the "expiring soon" reminder).
export async function extendHold(bookingId: string, days: number): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const n = Math.max(1, Math.min(30, Math.round(days)));
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can extend holds');

  const { data: bk } = await supabase.from('bookings').select('status').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');
  if (bk['status'] !== 'hold') return err('Only an active hold can be extended.');

  const newExpiry = new Date(Date.now() + n * 86400000).toISOString();
  const { error } = await supabase.from('bookings').update({ hold_expires_at: newExpiry }).eq('id', bookingId);
  if (error) { console.error('[extendHold]', error); return err('Failed to extend hold.'); }

  revalidateEnquiryPaths();
  revalidatePath('/bookings');
  return ok(undefined);
}

// ---------- releaseExpiredEnquiryHolds (lazy expiry) ----------

// Release enquiry-linked holds whose expiry has passed. Called (fire-and-forget) from
// the enquiries page load. Idempotent and cheap: one indexed query + bounded updates.
export async function releaseExpiredEnquiryHolds(): Promise<void> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await supabase
    .from('bookings')
    .select('id, source_enquiry_id')
    .eq('status', 'hold')
    .not('source_enquiry_id', 'is', null)
    .not('hold_expires_at', 'is', null)
    .lt('hold_expires_at', nowIso);

  for (const b of expired ?? []) {
    const bookingId = b['id'] as string;
    const enquiryId = b['source_enquiry_id'] as string;
    // Never auto-release a hold the guest has paid on — it surfaces under "Vouchers not sent" instead.
    const { data: hp } = await supabase.from('payments').select('id, type').eq('booking_id', bookingId).limit(5);
    if ((hp ?? []).some((p) => p['type'] !== 'refund')) continue;
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await supabase.from('enquiries').update({
      status: 'in_progress', held_booking_id: null,
      next_action: 'Hold expired — rooms released', updated_at: nowIso,
    }).eq('id', enquiryId).eq('held_booking_id', bookingId);
    await supabase.from('enquiry_activities').insert({
      id: `ACT-${Date.now()}-x-${bookingId.slice(-4)}`, enquiry_id: enquiryId, type: 'note',
      note: 'Hold expired automatically; rooms released', created_by: 'system', created_at: nowIso,
    });
  }
}
