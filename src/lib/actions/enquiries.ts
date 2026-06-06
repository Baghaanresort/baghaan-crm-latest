'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { EnquirySchema, UpdateEnquirySchema } from '@/lib/validations/enquiry';
import { enquiryToDb, dbToEnquiry } from '@/lib/mappers/enquiry';
import { bookingToDb } from '@/lib/mappers/booking';
import { generateConfirmationNumber } from '@/lib/utils/booking';
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
  if (!['Sales', 'Admin'].includes(actor.role)) {
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
  if (!['Sales', 'Admin'].includes(actor.role)) {
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
