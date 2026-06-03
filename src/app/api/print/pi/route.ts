import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { buildPIHTML } from '@/lib/utils/print';
import { BILLING_ENTITIES } from '@/lib/constants/billing';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) return new Response('Missing bookingId', { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error || !data) return new Response('Not found', { status: 404 });

  const booking = dbToBooking(data);
  if (!booking.proformaInvoice) return new Response('No proforma invoice for this booking', { status: 400 });

  const entity = BILLING_ENTITIES[booking.proformaInvoice.billingEntity ?? 'baghaan']!;
  const html = buildPIHTML(booking, booking.proformaInvoice, entity);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' },
  });
}
