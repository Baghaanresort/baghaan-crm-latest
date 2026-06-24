import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateVoucherPdf } from '@/lib/server/voucher-pdf-store';

export const runtime = 'nodejs';

const slug = (s: string) => (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'voucher';

function makeToken(bookingId: string): string {
  const secret = process.env.VOUCHER_SECRET ?? 'baghaan-orchard-voucher-2024';
  return createHmac('sha256', secret).update(bookingId).digest('hex').slice(0, 20);
}

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const token = request.nextUrl.searchParams.get('token');
  if (!bookingId) return new Response('Missing bookingId', { status: 400 });

  // Guests download with the signed token from the voucher email/link; staff use their session.
  const tokenOk = !!token && token === makeToken(bookingId);
  if (!tokenOk) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });
  }

  // Confirmation number for a friendly filename.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { data: bk } = await createAdminClient().from('bookings').select('confirmation_number').eq('id', bookingId).single();
  if (!bk) return new Response('Not found', { status: 404 });

  const buffer = await getOrCreateVoucherPdf(bookingId);
  if (!buffer) return new Response('Failed to generate PDF', { status: 500 });

  const filename = `Voucher-${slug(bk['confirmation_number'] as string)}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
