import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import type { Booking } from '@/lib/types/booking';

export async function getBookings(): Promise<Booking[]> {
  const supabase = await createClient();
  // Enquiry-driven holds live in the Enquiry tab until they're booked. Keep rows
  // where status != 'hold' OR there's no linked enquiry. (At BOOK the hold becomes
  // 'confirmed', so it surfaces here naturally.)
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .or('status.neq.hold,source_enquiry_id.is.null')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToBooking);
}

export async function getActiveBookings(): Promise<Booking[]> {
  const supabase = await createClient();
  // Every non-cancelled booking (confirmed + holds + checked-in/out) — i.e. the
  // exact set checkRoomConflict treats as occupying a room. Used to grey out taken
  // rooms in the Block modal so the client matches the server's conflict rule.
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToBooking);
}

export async function getBookingsForAccounts(): Promise<Booking[]> {
  const supabase = await createClient();
  // Accounts verifies advances paid during the enquiry BLOCK→PAY pipeline, which
  // are recorded against still-held bookings. Unlike getBookings (which hides
  // enquiry holds from the Bookings tab) this KEEPS holds so every payment can be
  // matched back to its guest/confirmation in the verification list and ledger.
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToBooking);
}

export async function getBookingsForCalendar(): Promise<Booking[]> {
  const supabase = await createClient();
  // The calendar shows true physical room availability, so unlike getBookings it
  // KEEPS enquiry-driven holds (status='hold' with a linked enquiry). Those rooms
  // are genuinely tied up, so they must appear on the occupancy grid. Cancelled
  // rows are filtered client-side in CalendarClient.
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToBooking);
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
  return data ? dbToBooking(data) : null;
}

export async function getBookingHistory(
  bookingId: string
): Promise<Array<{ id: string; changedBy: string; changedAt: string; changes: Record<string, { from: unknown; to: unknown }> }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('booking_history')
    .select('id, changed_by, changed_at, changes')
    .eq('booking_id', bookingId)
    .order('changed_at', { ascending: false });

  return (data ?? []).map(row => ({
    id: row['id'] as string,
    changedBy: row['changed_by'] as string,
    changedAt: row['changed_at'] as string,
    changes: row['changes'] as Record<string, { from: unknown; to: unknown }>,
  }));
}
