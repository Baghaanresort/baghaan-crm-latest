import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { buildVoucherHTML } from '@/lib/utils/print';
import { verifyVoucherToken } from '@/lib/server/voucher-token';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const token = request.nextUrl.searchParams.get('token');
  if (!bookingId || !token) return new Response('Missing params', { status: 400 });
  if (!verifyVoucherToken(bookingId, token)) return new Response('Invalid link', { status: 403 });

  // The signed token authorizes this exact booking; guests have no session, so
  // read via the admin client (RLS would otherwise return nothing for anon).
  const db = createAdminClient();
  const { data, error } = await db.from('bookings').select('*').eq('id', bookingId).single();
  if (error || !data) return new Response('Not found', { status: 404 });

  const { data: payRows } = await db.from('payments').select('*')
    .eq('booking_id', bookingId).eq('verified', true).order('payment_date', { ascending: true });
  const payments = (payRows ?? []).map(dbToPayment);
  const html = buildVoucherHTML(dbToBooking(data), payments);

  // Floating "Download PDF" button for the guest (hidden when printing).
  const pdfUrl = `/api/pdf/voucher?bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
  const fab = `<style>@media print{#dl-pdf-fab{display:none!important}}</style>`
    + `<div id="dl-pdf-fab" style="position:fixed;top:16px;right:16px;z-index:50">`
    + `<a href="${pdfUrl}" style="display:inline-block;background:#064e3b;color:#fef3c7;text-decoration:none;`
    + `padding:10px 18px;font-family:Lora,Georgia,serif;font-size:13px;letter-spacing:1px;border-radius:4px;`
    + `box-shadow:0 2px 8px rgba(0,0,0,0.15)">⬇ Download PDF</a></div>`;
  const withFab = html.replace('</body>', `${fab}</body>`);

  return new Response(withFab, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' },
  });
}
