'use server';

import { z } from 'zod';
import { createHmac } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { BookingSchema } from '@/lib/validations/booking';
import { bookingToDb, dbToBooking } from '@/lib/mappers/booking';
import { getBookingHistory } from '@/lib/queries/bookings';
import { checkRoomConflict } from '@/lib/utils/conflict';
import { isVoucherEditable } from '@/lib/utils/voucher';
import type { Booking } from '@/lib/types/booking';

export interface VoucherEditEntry {
  id: string;
  changedBy: string;
  changedAt: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

// Edit log for a voucher (sourced from the append-only booking_history table).
// Sales/Admin only — same audience that can edit vouchers.
export async function getVoucherHistory(bookingId: string): Promise<ActionResult<VoucherEditEntry[]>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Not authenticated');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['Sales', 'Sales Admin', 'Admin'].includes(profile.role as string)) {
    return err('Not authorized');
  }
  return ok(await getBookingHistory(bookingId));
}

function makeToken(bookingId: string): string {
  const secret = process.env.VOUCHER_SECRET ?? 'baghaan-orchard-voucher-2024';
  return createHmac('sha256', secret).update(bookingId).digest('hex').slice(0, 20);
}

export async function getVoucherShareUrl(bookingId: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const token = makeToken(bookingId);
  return `${proto}://${host}/api/voucher/view?bookingId=${bookingId}&token=${token}`;
}

// ---------- updateVoucher ----------
// Edits the booking fields shown on the voucher (single source of truth).
// Allowed for Sales/Admin, and only until 12h before check-in. Every edit is
// journaled to booking_history with the editor's user id + before/after values.

const VOUCHER_FIELDS: (keyof Booking)[] = [
  'guestName', 'contactNumber', 'email', 'companyName', 'gstNumber',
  'arrival', 'departure', 'nights', 'adults', 'children', 'rooms',
  'rateBreakdown', 'totalAmount', 'advancePaid', 'inclusions', 'remarks',
  'specialRequests', 'status', 'holdExpiresAt',
];

export async function updateVoucher(
  bookingId: string,
  input: z.infer<typeof BookingSchema>
): Promise<ActionResult<{ id: string }>> {
  if (!bookingId) return err('Booking ID required');

  const parsed = BookingSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Not authenticated');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) return err('Not authenticated');
  const role = profile.role as string;
  if (!['Sales', 'Sales Admin', 'Admin'].includes(role)) {
    return err('Only the Sales team can edit vouchers');
  }

  const { data: current, error: fetchErr } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (fetchErr || !current) return err('Booking not found');

  const currentBooking = dbToBooking(current);

  // Lock gate — based on the booking's existing (imminent) check-in date.
  if (!isVoucherEditable(currentBooking.arrival)) {
    return err('Voucher editing is locked within 12 hours of check-in.');
  }

  // Prevent double-booking when rooms/dates change.
  if (
    JSON.stringify(parsed.data.rooms) !== JSON.stringify(currentBooking.rooms) ||
    parsed.data.arrival !== currentBooking.arrival ||
    parsed.data.departure !== currentBooking.departure
  ) {
    const conflict = await checkRoomConflict(supabase, parsed.data.rooms, parsed.data.arrival, parsed.data.departure, bookingId);
    if (conflict) return err(conflict);
  }

  // Merge over the full existing booking so unspecified columns are preserved
  // (bookingToDb fills `||` defaults — a sparse object would clobber them).
  const merged = { ...currentBooking, ...parsed.data } as Booking;

  const { error: updErr } = await supabase.from('bookings').update(bookingToDb(merged)).eq('id', bookingId);
  if (updErr) {
    console.error('[updateVoucher]', updErr);
    return err('Failed to update voucher. Please try again.');
  }

  // Audit: before/after for every changed voucher field.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of VOUCHER_FIELDS) {
    const before = currentBooking[field];
    const after = merged[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes[field] = { from: before, to: after };
    }
  }

  if (Object.keys(changes).length > 0) {
    const now = new Date().toISOString();
    await supabase.from('booking_history').insert({
      id: `BH-${Date.now()}`,
      booking_id: bookingId,
      changed_by: profile.name as string,
      changed_by_id: user.id,
      changed_at: now,
      changes,
      snapshot: bookingToDb(merged),
    }).then(({ error: hErr }) => {
      if (hErr) console.error('[booking_history voucher]', hErr);
    });
  }

  revalidatePath('/vouchers');
  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  revalidatePath('/front-office');
  return ok({ id: bookingId });
}
