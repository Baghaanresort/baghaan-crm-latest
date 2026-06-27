import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { buildCostSheetHTML } from '@/lib/utils/print';
import { INCLUDED_ACTIVITIES } from '@/lib/constants/activities';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) return new Response('Missing bookingId', { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error || !data) return new Response('Not found', { status: 404 });

  const booking = dbToBooking(data);
  const items = booking.costSheet?.lineItems ?? [];
  const byDay: Record<string, number> = {};
  items.forEach(li => {
    const k = li.day || 'multi';
    byDay[k] = (byDay[k] ?? 0) + li.rate * li.qty;
  });

  const html = buildCostSheetHTML({
    booking,
    items,
    grandTotal: booking.costSheet?.grandTotal ?? 0,
    byDay,
    notes: booking.costSheet?.notes ?? '',
    inclusions: INCLUDED_ACTIVITIES, // always the fixed resort list (matches the PI)
    terms: booking.costSheet?.terms ?? '',
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' },
  });
}
