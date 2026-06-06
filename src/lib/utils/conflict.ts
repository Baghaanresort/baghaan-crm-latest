import type { createClient } from '@/lib/supabase/server';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

// Returns a human-readable message if any non-cancelled booking overlaps the
// given rooms + date range, otherwise null. Shared by booking and voucher edits
// so both enforce the same double-booking rule.
export async function checkRoomConflict(
  supabase: ServerSupabase,
  rooms: string[],
  arrival: string,
  departure: string,
  excludeBookingId?: string
): Promise<string | null> {
  if (!rooms.length) return null;

  let query = supabase
    .from('bookings')
    .select('confirmation_number, guest_name, arrival, departure, rooms')
    .neq('status', 'cancelled')
    .lt('arrival', departure)
    .gt('departure', arrival)
    .overlaps('rooms', rooms);

  if (excludeBookingId) query = query.neq('id', excludeBookingId);

  const { data, error } = await query.limit(1);
  if (error) { console.error('[checkRoomConflict]', error); return null; }
  if (!data || data.length === 0) return null;

  const c = data[0] as { confirmation_number: string; guest_name: string; arrival: string; departure: string };
  return `Room already booked: ${c.guest_name} (${c.confirmation_number}) is in one of these rooms from ${c.arrival} to ${c.departure}.`;
}
