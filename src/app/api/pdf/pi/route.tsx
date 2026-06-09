import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { ProformaInvoicePdf } from '@/lib/pdf/ProformaInvoicePdf';
import { BILLING_ENTITIES } from '@/lib/constants/billing';

export const runtime = 'nodejs';

const slug = (s: string) => (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice';

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

  const entity = BILLING_ENTITIES[booking.proformaInvoice.billingEntity ?? 'baghaan'] ?? BILLING_ENTITIES['baghaan']!;

  try {
    const buffer = await renderToBuffer(
      <ProformaInvoicePdf booking={booking} pi={booking.proformaInvoice} entity={entity} />,
    );
    const filename = `Proforma-Invoice-${slug(booking.proformaInvoice.piNumber)}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (e) {
    console.error('[pdf:pi]', e);
    return new Response('Failed to generate PDF', { status: 500 });
  }
}
