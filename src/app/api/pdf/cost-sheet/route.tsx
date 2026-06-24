import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { CostSheetPdf } from '@/lib/pdf/CostSheetPdf';

export const runtime = 'nodejs';

const slug = (s: string) => (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'booking';

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
    byDay[k] = (byDay[k] ?? 0) + (Number(li.rate) || 0) * (Number(li.qty) || 0);
  });

  try {
    const buffer = await renderToBuffer(
      <CostSheetPdf
        booking={booking}
        items={items}
        grandTotal={booking.costSheet?.grandTotal ?? 0}
        byDay={byDay}
        notes={booking.costSheet?.notes ?? ''}
        inclusions={booking.costSheet?.inclusions ?? []}
        terms={booking.costSheet?.terms ?? ''}
      />,
    );
    const filename = `Cost-Sheet-${slug(booking.companyName ?? '')}-${slug(booking.confirmationNumber)}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (e) {
    console.error('[pdf:cost-sheet]', e);
    return new Response('Failed to generate PDF', { status: 500 });
  }
}
