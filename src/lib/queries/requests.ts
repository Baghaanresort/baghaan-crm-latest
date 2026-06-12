import { createClient } from '@/lib/supabase/server';
import { dbToRequest } from '@/lib/mappers/request';
import type { BookingRequest } from '@/lib/types/request';

// All requests, newest first. Clients group/filter by status + type.
export async function getBookingRequests(): Promise<BookingRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('booking_requests')
    .select('*')
    .order('requested_at', { ascending: false });
  return (data ?? []).map(dbToRequest);
}
