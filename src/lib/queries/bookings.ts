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
