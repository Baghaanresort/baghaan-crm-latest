import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { buildVoucherHTML } from '@/lib/utils/print';

function makeToken(bookingId: string): string {
  const secret = process.env.VOUCHER_SECRET ?? 'baghaan-orchard-voucher-2024';
  return createHmac('sha256', secret).update(bookingId).digest('hex').slice(0, 20);
}

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const token = request.nextUrl.searchParams.get('token');
  if (!bookingId || !token) return new Response('Missing params', { status: 400 });
  if (token !== makeToken(bookingId)) return new Response('Invalid link', { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error || !data) return new Response('Not found', { status: 404 });

  const html = buildVoucherHTML(dbToBooking(data));
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' },
  });
}
