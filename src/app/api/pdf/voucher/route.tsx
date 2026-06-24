import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyVoucherToken } from '@/lib/server/voucher-token';
import { getOrCreateVoucherPdf } from '@/lib/server/voucher-pdf-store';

export const runtime = 'nodejs';

const slug = (s: string) => (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'voucher';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const token = request.nextUrl.searchParams.get('token');
  if (!bookingId) return new Response('Missing bookingId', { status: 400 });

  let confirmation = '';

  if (verifyVoucherToken(bookingId, token)) {
    // Guest path: the signed token authorizes exactly this bookingId.
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data: bk } = await createAdminClient()
      .from('bookings').select('confirmation_number').eq('id', bookingId).single();
    if (!bk) return new Response('Not found', { status: 404 });
    confirmation = (bk['confirmation_number'] as string) ?? '';
  } else {
    // Staff path: must be authenticated AND able to see this booking under RLS
    // (same authorization model as /api/print/voucher — no admin bypass here).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });
    const { data: bk } = await supabase
      .from('bookings').select('confirmation_number').eq('id', bookingId).single();
    if (!bk) return new Response('Not found', { status: 404 });
    confirmation = (bk['confirmation_number'] as string) ?? '';
  }

  // Authorization passed above; serve the stored (content-addressed) PDF from the bucket.
  const buffer = await getOrCreateVoucherPdf(bookingId);
  if (!buffer) return new Response('Failed to generate PDF', { status: 500 });

  const filename = `Voucher-${slug(confirmation)}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
