'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { BookingSchema, FinalBillSchema, BlockRoomSchema } from '@/lib/validations/booking';
import { bookingToDb, dbToBooking } from '@/lib/mappers/booking';
import { generateConfirmationNumber } from '@/lib/utils/booking';
import { checkRoomConflict } from '@/lib/utils/conflict';
import type { Booking, FinalBill } from '@/lib/types/booking';

// ---------- Helpers ----------

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

async function getCounter(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase
    .from('meta')
    .select('value')
    .eq('key', 'booking_counter')
    .single();
  return data ? parseInt(data.value as string) : 696;
}

async function saveCounter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  value: number
): Promise<void> {
  await supabase.from('meta').upsert({ key: 'booking_counter', value: String(value) });
}

function revalidateAll() {
  revalidatePath('/dashboard');
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/front-office');
  revalidatePath('/accounts');
  revalidatePath('/vouchers');
}

// ---------- createBooking ----------

export async function createBooking(
  input: z.infer<typeof BookingSchema>
): Promise<ActionResult<{ id: string; confirmationNumber: string }>> {
  const parsed = BookingSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  const conflict = await checkRoomConflict(supabase, parsed.data.rooms ?? [], parsed.data.arrival, parsed.data.departure);
  if (conflict) return err(conflict);

  // Auto-match or create guest
  const guestId = await resolveGuestId(supabase, {
    phone: parsed.data.contactNumber,
    name: parsed.data.guestName,
    email: parsed.data.email ?? '',
    companyName: parsed.data.companyName ?? '',
    gstNumber: parsed.data.gstNumber ?? '',
  });

  const counter = await getCounter(supabase);
  const newCounter = counter + 1;
  const confirmationNumber = generateConfirmationNumber(newCounter);
  const id = `BK-${Date.now()}`;
  const now = new Date().toISOString();

  const booking: Booking = {
    ...(parsed.data as unknown as Booking),
    id,
    confirmationNumber,
    createdAt: now,
    createdBy: parsed.data.createdBy || actor.name,
    guestId: guestId ?? null,
    bookingType: 'regular',
    corporateStage: null,
    companyAddress: '',
    companyGST: '',
    contactName: '',
    contactEmail: '',
    guestCount: null,
    costSheet: null,
    proformaInvoice: null,
    sourceEnquiryId: null,
    finalBill: null,
    email: parsed.data.email ?? '',
    companyName: parsed.data.companyName ?? '',
    gstNumber: parsed.data.gstNumber ?? '',
    rateBreakdown: parsed.data.rateBreakdown ?? '',
    inclusions: parsed.data.inclusions ?? '',
    remarks: parsed.data.remarks ?? '',
    specialRequests: parsed.data.specialRequests ?? '',
    holdExpiresAt: parsed.data.holdExpiresAt ?? null,
  };

  const { error } = await supabase.from('bookings').insert(bookingToDb(booking));
  if (error) {
    console.error('[createBooking]', error);
    return err('Failed to create booking. Please try again.');
  }

  await saveCounter(supabase, newCounter);
  revalidateAll();
  return ok({ id, confirmationNumber });
}

// ---------- createBlockedRoom ----------

export async function createBlockedRoom(
  input: z.infer<typeof BlockRoomSchema>
): Promise<ActionResult<{ id: string; confirmationNumber: string }>> {
  const parsed = BlockRoomSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  const blockConflict = await checkRoomConflict(supabase, parsed.data.rooms ?? [], parsed.data.arrival, parsed.data.departure);
  if (blockConflict) return err(blockConflict);

  const counter = await getCounter(supabase);
  const newCounter = counter + 1;
  const confirmationNumber = generateConfirmationNumber(newCounter);
  const id = `BK-${Date.now()}`;
  const now = new Date().toISOString();

  const booking: Booking = {
    id,
    confirmationNumber,
    guestName: parsed.data.guestName,
    contactNumber: parsed.data.contactNumber,
    email: '',
    companyName: '',
    gstNumber: '',
    arrival: parsed.data.arrival,
    departure: parsed.data.departure,
    nights: parsed.data.nights,
    adults: parsed.data.adults,
    children: parsed.data.children,
    rooms: parsed.data.rooms,
    rateBreakdown: '',
    totalAmount: parsed.data.quotedAmount ?? 0,
    advancePaid: 0,
    inclusions: '',
    remarks: parsed.data.notes ?? '',
    specialRequests: '',
    createdBy: parsed.data.createdBy || actor.name,
    status: 'hold',
    holdExpiresAt: parsed.data.holdExpiresAt ?? null,
    finalBill: null,
    createdAt: now,
    bookingType: 'regular',
    corporateStage: null,
    companyAddress: '',
    companyGST: '',
    contactName: '',
    contactEmail: '',
    guestCount: null,
    costSheet: null,
    proformaInvoice: null,
    sourceEnquiryId: null,
    guestId: null,
  };

  const { error } = await supabase.from('bookings').insert(bookingToDb(booking));
  if (error) {
    console.error('[createBlockedRoom]', error);
    return err('Failed to block rooms. Please try again.');
  }

  await saveCounter(supabase, newCounter);
  revalidateAll();
  return ok({ id, confirmationNumber });
}

// ---------- updateBooking ----------

const TRACKED_FIELDS: (keyof Booking)[] = [
  'guestName', 'arrival', 'departure', 'rooms', 'totalAmount', 'status', 'advancePaid',
];

export async function updateBooking(
  bookingId: string,
  input: Partial<Booking>
): Promise<ActionResult<{ id: string }>> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  // Fetch current booking for diff / history
  const { data: current, error: fetchErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();
  if (fetchErr || !current) return err('Booking not found');

  // Check conflicts only when rooms or dates are changing
  if (input.rooms || input.arrival || input.departure) {
    const rooms = input.rooms ?? dbToBooking(current).rooms ?? [];
    const arrival = input.arrival ?? current['arrival'] as string;
    const departure = input.departure ?? current['departure'] as string;
    const updateConflict = await checkRoomConflict(supabase, rooms, arrival, departure, bookingId);
    if (updateConflict) return err(updateConflict);
  }

  const updates = Object.fromEntries(
    Object.entries(bookingToDb(input as Booking)).filter(([, v]) => v !== undefined)
  );

  const { error } = await supabase.from('bookings').update(updates).eq('id', bookingId);
  if (error) {
    console.error('[updateBooking]', error);
    return err('Failed to update booking. Please try again.');
  }

  // Write audit history (Admin-visible)
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of TRACKED_FIELDS) {
    const dbField = bookingToDb(current as Booking)[field] ?? current[field as keyof typeof current];
    const newField = (input as Record<string, unknown>)[field];
    if (newField !== undefined && JSON.stringify(dbField) !== JSON.stringify(newField)) {
      changes[field] = { from: dbField, to: newField };
    }
  }

  if (Object.keys(changes).length > 0) {
    await supabase.from('booking_history').insert({
      id: `BH-${Date.now()}`,
      booking_id: bookingId,
      changed_by: actor.name,
      changed_at: new Date().toISOString(),
      changes,
      snapshot: { ...current, ...updates },
    }).then(({ error: hErr }) => {
      if (hErr) console.error('[booking_history]', hErr);
    });
  }

  revalidateAll();
  return ok({ id: bookingId });
}

// ---------- deleteBooking ----------

export async function deleteBooking(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (actor.role !== 'Admin') return err('Only Admin can delete bookings');

  // Corporate bookings are a permanent record — never deletable (business rule).
  const { data: existing } = await supabase.from('bookings').select('booking_type').eq('id', bookingId).single();
  if (existing?.['booking_type'] === 'corporate') {
    return err('Corporate bookings cannot be deleted.');
  }

  const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
  if (error) {
    console.error('[deleteBooking]', error);
    return err('Failed to delete booking.');
  }

  revalidateAll();
  return ok(undefined);
}

// ---------- setFinalBill ----------

export async function setFinalBill(
  input: z.infer<typeof FinalBillSchema>
): Promise<ActionResult> {
  const parsed = FinalBillSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Front Office', 'Admin'].includes(actor.role)) {
    return err('Only Front Office and Admin can record final bills');
  }

  // Fetch current final_bill to preserve recordedAt
  const { data: current } = await supabase
    .from('bookings')
    .select('final_bill')
    .eq('id', parsed.data.bookingId)
    .single();

  const existingBill = current?.['final_bill'] as FinalBill | null;
  const now = new Date().toISOString();

  const finalBill: FinalBill = {
    billNumber: parsed.data.billNumber,
    totalAmount: parsed.data.totalAmount,
    billDate: parsed.data.billDate,
    isBTC: parsed.data.isBTC,
    notes: parsed.data.notes ?? '',
    recordedAt: existingBill?.recordedAt ?? now,
    recordedBy: existingBill?.recordedBy ?? actor.name,
    updatedAt: now,
    updatedBy: actor.name,
  };

  const { error } = await supabase
    .from('bookings')
    .update({ final_bill: finalBill })
    .eq('id', parsed.data.bookingId);

  if (error) {
    console.error('[setFinalBill]', error);
    return err('Failed to record final bill.');
  }

  revalidateAll();
  revalidatePath('/front-office');
  return ok(undefined);
}

// ---------- clearFinalBill ----------

export async function clearFinalBill(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Front Office', 'Admin'].includes(actor.role)) {
    return err('Only Front Office and Admin can remove final bills');
  }

  const { error } = await supabase
    .from('bookings')
    .update({ final_bill: null })
    .eq('id', bookingId);

  if (error) {
    console.error('[clearFinalBill]', error);
    return err('Failed to remove final bill.');
  }

  revalidateAll();
  return ok(undefined);
}

// ---------- Guest resolver (internal) ----------

async function resolveGuestId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: { phone: string; name: string; email: string; companyName: string; gstNumber: string }
): Promise<string | null> {
  if (!data.phone) return null;

  // Try to find existing guest by phone
  const { data: existing } = await supabase
    .from('guests')
    .select('id')
    .eq('phone', data.phone)
    .maybeSingle();

  if (existing) return existing.id as string;

  // Create new guest
  const guestId = `GST-${Date.now()}`;
  const now = new Date().toISOString();
  const { error } = await supabase.from('guests').insert({
    id: guestId,
    name: data.name,
    phone: data.phone,
    email: data.email,
    company_name: data.companyName,
    gst_number: data.gstNumber,
    preferences: '',
    internal_notes: '',
    created_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('[resolveGuestId]', error);
    return null;
  }

  return guestId;
}
